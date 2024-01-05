function sdpToObj(offer: RTCLocalSessionDescriptionInit) {
	if (!offer.sdp)
		throw new Error('no sdp in offer');

	const sdpArray = offer.sdp.split('\n');
	const obj: Record<string, any> = {};

	for (let x = 0; x < sdpArray.length; x++) {
		const pair = sdpArray[x].split('=');
		const key = pair[0];
		const val = pair[1];

		if (key) {
			if (key === 'a') {
				if (!obj.a) {
					obj.a = {};
				}

				const valPair = val.split(/:(.+)/);
				obj.a[valPair[0]] = valPair[1];
			} else {
				obj[key] = val;
			}
		}
	}

	return obj;
}

function randomSessionId() {
	const random = new Uint8Array(16);
	crypto.getRandomValues(random);

	return random.map((n) => n % 10).join('');
}

export class RTC {
	rtc: RTCPeerConnection;
	private onCandidate: (candidateJSON: string) => void;
	channels: { [id: number]: RTCDataChannel; };
	serverOffer: RTCSessionDescriptionInit;
	offer: RTCLocalSessionDescriptionInit | null;
	started: null | Promise<void>;
	configureRTC: ((rtc: RTCPeerConnection) => void) | undefined;
	attemptId: string;
	sdp: Record<string, any> | null;

	constructor(serverOffer: RTCSessionDescriptionInit, attemptId: string,
				onCandidate: (candidateJSON: string) => void,
				iceServers: RTCIceServer[] = [], certificates: RTCCertificate[] = []) {
		this.onCandidate = onCandidate;
		this.attemptId = attemptId;
		this.serverOffer = serverOffer;
		this.started = null;
		this.sdp = null;
		this.channels = {};
		this.offer = null;

		this.rtc = new RTCPeerConnection({
			// edit: rename from urls to iceServers
			iceServers: [
				{urls: 'stun:stun.l.google.com:19302'},
				{urls: 'stun:stunserver.org:3478'},
				// edit: pass additional iceServers from Client for TURN support
				...iceServers,
			],
			certificates: certificates,
		});

		this.rtc.onicecandidate = (event) => {
			if (event.candidate && event.candidate.candidate) {
				console.info('candidate', event.candidate);
				const carray = event.candidate.candidate.replace('candidate:', '').split(' ');

				if (carray[2].toLowerCase() === 'udp') {
					this.onCandidate(JSON.stringify(event.candidate));
				} else {
					console.warn('ignoring non-udp candidate', event.candidate.candidate);
				}
			} else {
				console.info('no more ICE candidates');
			}
		};
	}

	close() {
		for (const kv of Object.entries(this.channels))
			kv[1].close();

		this.rtc.close();
	}

	addChannel(name: string, id: number,
			   onOpen: (this: RTCDataChannel, ev: Event) => any,
			   onMessage: (this: RTCDataChannel, ev: MessageEvent<any>) => any) {
		this.channels[id] = this.rtc.createDataChannel(name, {id});
		this.channels[id].binaryType = 'arraybuffer';
		this.channels[id].onopen = onOpen;
		this.channels[id].onmessage = onMessage;
	}

	setChannel(id: number, channel: RTCDataChannel) {
		this.channels[id] = channel;
		this.channels[id].binaryType = 'arraybuffer';
	}

	async createAnswer() {
		try{
			await this.rtc.setRemoteDescription(this.serverOffer);
		} catch (e) {
			console.error(e, this.serverOffer);
			throw e;
		}
		if (this.configureRTC) {
			this.configureRTC(this.rtc);
		}
		this.offer = await this.rtc.createAnswer();
		this.sdp = sdpToObj(this.offer);
		return this.offer;
	}

	send(buf: ArrayBuffer, id: number) {
		this.channels[id].send(buf);
	}

	async setRemoteCandidate(candidate: string, theirCreds: any) {
		console.log('setRemoteCandidate', candidate, theirCreds);
		if (this.started === null) {
			this.started = new Promise(async (resolve, reject) => {
				try {
					//this will begin STUN
					if (this.offer === null) {
						reject(new Error("offer is null"));
						return;
					}
					await this.rtc.setLocalDescription(this.offer);
					console.log("setLocalDescription", this.offer);
					resolve();
				} catch (e) {
					console.error('setLocalDescription failed', e);
					reject(e);
				}
			});
		}
		await this.started;

		const remoteCandidate = JSON.parse(candidate);
		await this.rtc.addIceCandidate(remoteCandidate);
	}
}
