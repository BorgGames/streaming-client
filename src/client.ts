// Util modules
import * as Enum from './enum.js';
import * as Msg from './msg.js';
import * as Util from './util.js';

// Class modules
import {Input} from './input.js';
import {RTC} from './rtc.js';
import {VideoPlayer} from './video.js';
import {ISignal} from './signal.js';

function cfgDefaults(cfg: any) {
	if (!cfg) cfg = {};

	//required for MSE
	cfg.network_video_container = 2;

	if (!cfg.app_ss_endpoint)
		cfg.app_ss_endpoint = 'borg.games';

	if (!cfg.app_ss_port)
		cfg.app_ss_port = 443;

	if (!cfg.server_resolution_x && !cfg.server_resolution_y) {
		const w = window.screen.width;
		const h = window.screen.height;

		cfg.server_resolution_x = 1920;
		cfg.server_resolution_y = 1080;

		if (w >= 800 && h >= 600 && w <= 1920 && h <= 1080) {
			cfg.server_resolution_x = w;
			cfg.server_resolution_y = h;
		}
	}

	return cfg;
}

export interface IConnectionAPI {
	connectionUpdate: (update: any) => void;
}

export interface IClientEvent {
	type: string;
	msg?: Msg.IControlMessage | { str: string };
}

export interface IShutterEvent extends IClientEvent {
	enabled: boolean;
}

export interface IExitEvent extends IClientEvent {
	code: StopCodes;
}

enum StopCodes {
	CONNECTION_TIMEOUT = 4080,
	CONCURRENT_SESSION = 4090,
	GENERAL_ERROR = 4500,
}

const cert = await RTCPeerConnection.generateCertificate({
	name: 'RSASSA-PKCS1-v1_5',
	hash: 'SHA-256',
	modulusLength: 2048,
	publicExponent: new Uint8Array([1, 0, 1])
} as RsaHashedKeyGenParams);

export class Client {
	rtc: RTC | null;
	signal: ISignal;
	isConnected: boolean;
	videoPlayer: VideoPlayer;
	input: Input;
	connected: Promise<unknown>;

	private connectedResolve!: (value: unknown) => void;
	private connectedReject!: (reason?: any) => void;
	private pingInterval: null | number;
	video: HTMLVideoElement;
	private listeners: any[];
	onEvent: (event: IClientEvent) => void;
	channelOpen: (name: string, channel: RTCDataChannel) => void;
	paused: boolean;
	private _reinitTimeout?: number;
	pingLast: null | number;
	pingMax: null | number;
	private api: IConnectionAPI;
	stallTimeout: number;
	element: Element;
	stream?: MediaStream;
	iceServers: any[];
	private configureRTC?: (rtc: RTCPeerConnection) => void;
	exitCode?: number;
	logInterval?: number;

	constructor(api: IConnectionAPI, signalFactory: (exit: (code: number) => void) => ISignal,
				element: Element, onEvent: (event: IClientEvent) => void,
				channelOpen: (name: string, channel: RTCDataChannel) => void,
				iceServers = []) {
		this.api = api;
		this.onEvent = onEvent;
		this.channelOpen = channelOpen;
		this.isConnected = false;
		this.connected = new Promise((resolve, reject) => {
			this.connectedResolve = resolve;
			this.connectedReject = reject;
		});
		this.rtc = null;
		this.pingInterval = null;
		this.listeners = [];
		this.pingMax = null;
		this.pingLast = null;
		this.iceServers = iceServers;
		const video = element.tagName === 'VIDEO'
			? <HTMLVideoElement>element
			: <HTMLVideoElement>element.querySelector('video');
		this.video = video;
		this.element = element;
		this.paused = false;
		this.stallTimeout = 1000;

		this.videoPlayer = new VideoPlayer(video, () => {
			this.rtc!.send(Msg.reinit(), 0);
		});

		this.signal = signalFactory((code: number) => {
			this.destroy(code === 4001 ? Enum.Warning.PeerGone : code);
		});

		this.input = new Input(video, (buf) => {
			if (this.isConnected)
				this.rtc!.send(buf, 0);
		});

		this.listeners.push(Util.addListener(window, 'beforeunload', () => {
			this.destroy(0);
			return null;
		}));
		this.listeners.push(Util.addListener(video, 'playing', () => {
			this._status('');
		}));

		for (const event of ['abort', 'ended', 'stalled', 'suspend', 'waiting']) {
			this.listeners.push(Util.addListener(video, event, () => {
				if (!this.exited() && this.isConnected)
					this.rtc!.send(Msg.reinit(), 0);
				this._status('video ' + event);
			}));
		}
		this.listeners.push(Util.addListener(video, 'error', () => {
			if (!this.exited() && this.isConnected)
				this.rtc!.send(Msg.reinit(), 0);
			this._status('video error: ' + video.error!.message);
		}));
	}

	_dispatchEvent(buf: ArrayBufferLike) {
		const msg = Msg.unpack(buf);

		switch (msg.type) {
			case Enum.Msg.Cursor:
				const cursorMsg = <Msg.ICursorMessage>msg;
				this.input.setMouseMode(cursorMsg.relative, cursorMsg.hidden);

				if (cursorMsg.data)
					this.input.setCursor(cursorMsg.data, cursorMsg.hotX, cursorMsg.hotY);

				break;

			case Enum.Msg.Abort:
				console.log('Server Abort', msg.data0);
				this.destroy(msg.data0);
				break;

			case Enum.Msg.Shutter:
				this.onEvent({type: 'shutter', enabled: !!msg.data0} as IShutterEvent);
				break;

			case Enum.Msg.Status:
				this.onEvent({type: 'status', msg});
				break;

			case Enum.Msg.Chat:
				this.onEvent({type: 'chat', msg});
				break;
		}
	}

	async connect(sessionId: string, serverOffer: RTCSessionDescriptionInit, cfg: any) {
		cfg = cfgDefaults(cfg);
		cfg = this.signal.cfgDefaults(cfg);

		const onRTCCandidate = (candidateJSON: string) => {
			this.signal.sendCandidate(candidateJSON);
		};

		const onControlOpen = async () => {
			this._status('connected\n\nwaiting for reply...');
			const channel = this.rtc!.channels[0];
			try {
				var networkStatistics = await this.channelOpen('control', channel);
			} catch (e) {
				this.connectedReject(e);
				return;
			}

			if (this.exited())
				return;

			this._status('waiting for video...');

			// TODO decide if we want to continue

			channel.onmessage = (event) => {
				this._dispatchEvent(event.data);
			};

			this.isConnected = true;
			this.connectedResolve(networkStatistics);

			this.paused = false;
			this.listeners.push(Util.addListener(document, 'visibilitychange', () => {
				if (document.hidden) {
					this.video.pause();
					this.paused = true;
					this.rtc!.send(Msg.block(), 0);
				} else {
					this.video.play();
					this.paused = false;
					this.rtc!.send(Msg.reinit(), 0);
				}
				this.onEvent({type: 'pause', msg: {str: this.paused.toString()}});
			}));

			this.rtc!.send(Msg.config(cfg), 0);
			this.rtc!.send(Msg.init(), 0);

			this.pingInterval = setInterval(() => {
				this._ping();
			}, 1000);
			this._setReinitTimeout();
			this.listeners.push(Util.addListener(this.video, 'timeupdate', () => {
				this.onEvent({type: 'frame'});
				clearTimeout(this._reinitTimeout);
				this._setReinitTimeout();
			}));

			if (this.stream) {
				this.video.srcObject = this.stream;
				// TODO this.element.play(); needs user interaction
				this.video.play();
			}

			this.input.attach();
			this.onEvent({type: 'connect'});
		};

		this.rtc = new RTC(serverOffer, this.signal.getAttemptId(), onRTCCandidate, this.iceServers, [cert]);

		this.rtc.rtc.addEventListener('datachannel', (event) => {
			const channel = event.channel;
			console.log("datachannel", channel.label, channel.id, channel.readyState);
			switch (channel.label) {
			case 'control':
				this.rtc!.setChannel(0, channel);
				onControlOpen();
				break;
			case 'persistence':
				this.channelOpen('persistence', channel);
				break;
			default:
				console.error('Unknown datachannel', channel.label);
				break;
			}
		});

		this.rtc.rtc.ontrack = (event) => {
			console.log("ontrack", event.streams[0]);
			if (event.track.kind !== 'video')
				return;
			this.stream = event.streams[0];
			this.stream.addEventListener('removetrack', (event) => {
				console.debug("removetrack", event);
			});
		};

		if (this.configureRTC) {
			this.configureRTC(this.rtc.rtc);
			this.rtc.configureRTC = this.configureRTC;
		}

		const myAnswer = await this.rtc.createAnswer();

		if (isVideoInactive(myAnswer.sdp!))
			throw new Error("Browser does not support necessary video codec");

		this._status('connecting...');

		this.signal.connect(cfg, sessionId, myAnswer, (candidate: string, theirCreds: any) => {
			this.rtc!.setRemoteCandidate(candidate, theirCreds);
		});

		return await this.connected;
	}

	_setReinitTimeout() {
		this._reinitTimeout = setTimeout(() => {
			if (!this.exited() && !this.paused) {
				this.onEvent({type: 'stall'});
				console.debug('timeupdate stalled');
				this.rtc!.send(Msg.reinit(), 0);
				this._setReinitTimeout();
			}
		}, this.stallTimeout);
	}

	async _ping() {
		const channel = this.rtc!.channels[0];
		const tag = Math.floor(Math.random() * 0x60000000);
		const start = performance.now();
		var completed = false;
		const roundtrip = new Promise<number>((resolve, reject) => {
			function responseListener(event: MessageEvent<ArrayBuffer>) {
				const end = performance.now();
				if (end - start > 30000) {
					channel.removeEventListener('message', responseListener);
					console.error(`ping timeout ${tag}`);
					reject("timeout");
					return;
				}

				const msg = Msg.unpack(event.data);
				if (msg.type !== Enum.Msg.Ping || msg.data0 !== tag) {
					return;
				}
				channel.removeEventListener('message', responseListener);
				resolve(end);
			}

			channel.addEventListener('message', responseListener);
			setTimeout(() => {
				channel.removeEventListener('message', responseListener);
				if (!completed) {
					console.error(`ping timeout ${tag}`);
					reject("timeout");
				}
			}, 30000);
		});
		this.rtc!.send(Msg.ping(tag), 0);
		console.debug(`ping ${tag}`);
		// wait for echo
		try {
			var end = await roundtrip;
		} catch (e) {
			if (e === "timeout")
				return;
			throw e;
		}
		completed = true;
		const roundtrip_ms = end - start;
		this.pingLast = roundtrip_ms;
		if (this.pingMax === null || roundtrip_ms > this.pingMax)
			this.pingMax = roundtrip_ms;
		console.debug(`ping ${tag}: ${roundtrip_ms}ms   max: ${this.pingMax}ms`);
	}

	exited() {
		return this.hasOwnProperty('exitCode');
	}

	_status(msg: string) {
		this.onEvent({type: 'status', msg: {str: msg}})
	}

	destroy(code: number) {
		if (this.exited()) {
			console.warn(`exit reentry {code} after {this.exitCode}`);
			return;
		}

		this.exitCode = code;
		Util.removeListeners(this.listeners);

		this.signal.close(code >= 3000 && code < 5000 ? code : 1000);
		if (code !== Client.StopCodes.CONCURRENT_SESSION) {
			this.video.pause();
		}
		this.videoPlayer.destroy();
		this.input.detach();

		if (this.pingInterval !== null) {
			clearInterval(this.pingInterval);
			this.pingInterval = null;
		}

		if (this.isConnected) {
			clearInterval(this.logInterval);
			this.rtc!.send(Msg.abort(code), 0);
		}

		this.api.connectionUpdate({
			state_str: 'LSC_EXIT',
			attempt_id: this.signal.getAttemptId(),
			exit_code: code,
		});

		if (this.rtc !== null)
			this.rtc.close();
		this.isConnected = false;
		this.onEvent({type: 'exit', code} as IExitEvent);
	}

	static StopCodes = StopCodes;
}

const videoInactiveRegex = /m=video\s+0\s+/;
function isVideoInactive(sdp: string) {
	return videoInactiveRegex.test(sdp);
}

