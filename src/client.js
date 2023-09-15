// Util modules
import * as Enum from './enum.js';
import * as Msg from './msg.js';
import * as Util from './util.js';

// Class modules
import {AudioPlayer} from './audio.js';
import {Input} from './input.js';
import {RTC} from './rtc.js';
import {VideoPlayer} from './video.js';

function cfgDefaults(cfg) {
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

export class Client {
	// edit: accept additional iceServers and pass them to RTC
	constructor(api, signalFactory, element, onEvent, channelOpen, iceServers = []) {
		this.api = api;
		this.onEvent = onEvent;
		this.channelOpen = channelOpen;
		this.audioPlayer = new AudioPlayer();
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
		this.element = element;

		this.videoPlayer = new VideoPlayer(element, () => {
			this.rtc.send(Msg.reinit(), 0);
		});

		this.signal = signalFactory((code) => {
			this.destroy(code === 4001 ? Enum.Warning.PeerGone : code);
		});

		this.input = new Input(element, (buf) => {
			if (this.isConnected)
				this.rtc.send(buf, 0);
		});

		this.listeners.push(Util.addListener(window, 'beforeunload', () => {
			this.destroy(0);
			return null;
		}));
		this.listeners.push(Util.addListener(element, 'playing', () => {
			this._status('');
		}));
		
		for(const event of ['abort', 'ended', 'stalled', 'suspend', 'waiting']){
			this.listeners.push(Util.addListener(element, event, () => {
				if (!this.exited() && this.isConnected)
					this.rtc.send(Msg.reinit(), 0);
				this._status('video ' + event);
			}));
		}
		this.listeners.push(Util.addListener(element, 'error', () => {
			if (!this.exited() && this.isConnected)
				this.rtc.send(Msg.reinit(), 0);
			this._status('video error: ' + element.error.message);
		}));
	}

	_dispatchEvent(buf) {
		const msg = Msg.unpack(buf);

		switch (msg.type) {
			case Enum.Msg.Cursor:
				this.input.setMouseMode(msg.relative, msg.hidden);

				if (msg.data)
					this.input.setCursor(msg.data, msg.hotX, msg.hotY);

				break;

			case Enum.Msg.Abort:
				console.log('Server Abort', msg.data0);
				this.destroy(msg.data0);
				break;

			case Enum.Msg.Shutter:
				this.onEvent({type: 'shutter', enabled: !!msg.data0});
				break;

			case Enum.Msg.Status:
				this.onEvent({type: 'status', msg});
				break;

			case Enum.Msg.Chat:
				this.onEvent({type: 'chat', msg});
				break;
		}
	}

	async connect(sessionId, serverOffer, cfg) {
		cfg = cfgDefaults(cfg);
		cfg = this.signal.cfgDefaults(cfg);

		const onRTCCandidate = (candidate) => {
			this.signal.sendCandidate(candidate);
		};

		const onControlOpen = async () => {
			this._status('connected\n\nwaiting for reply...');
			const channel = this.rtc.channels[0];
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
					this.element.pause();
					this.paused = true;
					this.rtc.send(Msg.block(), 0);
				} else {
					this.element.play();
					this.paused = false;
					this.rtc.send(Msg.reinit(), 0);
				}
			}));

			this.rtc.send(Msg.config(cfg), 0);
			this.rtc.send(Msg.init(), 0);

			this.pingInterval = setInterval(() => { this._ping(); }, 1000);
			this._setReinitTimeout();
			this.listeners.push(Util.addListener(this.element, 'timeupdate', () => {
				clearTimeout(this._reinitTimeout);
				this._setReinitTimeout();
			}));

			if (this.hasOwnProperty('stream'))
				this.element.srcObject = this.stream;

			this.input.attach();
			this.onEvent({type: 'connect'});
		};

		this.rtc = new RTC(serverOffer, this.signal.getAttemptId(), onRTCCandidate, this.iceServers);

		this.rtc.rtc.addEventListener('datachannel', (event) => {
			const channel = event.channel;
			console.log("datachannel", channel.label, channel.id, channel.readyState);
			switch (channel.label) {
			case 'control':
				this.rtc.setChannel(0, channel);
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
			this.element.addEventListener('error', (e) => {
				console.error('video error', e);
			});
			this.stream = event.streams[0];
			this.element.srcObject = this.stream;
			console.log("ontrack", event.streams[0]);
			// TODO this.element.play(); needs user interaction
		};
		
		this.rtc.rtc.onremovetrack = (event) => {
			console.debug("onremovetrack", event);
		};

		// this.rtc.addChannel('audio', 2, null, (event) => {
		// 	this.audioPlayer.queueData(event.data);
		// });
		
		if ("configureRTC" in this) {
			this.configureRTC(this.rtc.rtc);
			this.rtc.configureRTC = this.configureRTC;
		}

		const myAnswer = await this.rtc.createAnswer();
		
		if (isVideoInactive(myAnswer.sdp))
			throw new Error("Browser does not support necessary video codec");
		
		this._status('connecting...');

		this.signal.connect(cfg, sessionId, myAnswer, (candidate, theirCreds) => {
			this.rtc.setRemoteCandidate(candidate, theirCreds);
		});

		return await this.connected;
	}

	_setReinitTimeout() {
		this._reinitTimeout = setTimeout(() => {
			if (!this.exited() && !this.paused) {
				console.debug('timeupdate stalled');
				this.rtc.send(Msg.reinit(), 0);
				this._setReinitTimeout();
			}
		}, 350);
	}
	async _ping() {
		const channel = this.rtc.channels[0];
		const tag = Math.floor(Math.random() * 0x60000000);
		const start = performance.now();
		var completed = false;
		const roundtrip = new Promise((resolve, reject) => {
			function responseListener(event) {
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
		this.rtc.send(Msg.ping(tag), 0);
		console.debug(`ping ${tag}`);
		// wait for echo
		try{
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
	_status(msg) {
		this.onEvent({type: 'status', msg})
	}

	destroy(code) {
		if (this.exited()) {
			console.warn(`exit reentry {code} after {this.exitCode}`);
			return;
		}

		this.exitCode = code;
		Util.removeListeners(this.listeners);

		this.signal.close(code >= 3000 && code < 5000 ? code : 1000);
		if (code !== Client.StopCodes.CONCURRENT_SESSION) {
			this.element.pause();
		}
		this.videoPlayer.destroy();
		this.audioPlayer.destroy();
		this.input.detach();

		if (this.pingInterval !== null) {
			clearInterval(this.pingInterval);
			this.pingInterval = null;
		}

		if (this.isConnected) {
			clearInterval(this.logInterval);
			this.rtc.send(Msg.abort(code), 0);
		}

		this.api.connectionUpdate({
			state_str: 'LSC_EXIT',
			attempt_id: this.signal.getAttemptId(),
			exit_code: code,
		});

		if (this.rtc !== null)
			this.rtc.close();
		this.isConnected = false;
		this.onEvent({type: 'exit', code});
	}
}

const videoInactiveRegex = /m=video\s+0\s+/;
function isVideoInactive(sdp) {
	return videoInactiveRegex.test(sdp);
}


Client.StopCodes = Object.freeze({
	CONNECTION_TIMEOUT: 4080,
	CONCURRENT_SESSION: 4090,
});
