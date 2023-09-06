function sdpToObj(sdp) {
	const sdpArray = sdp.sdp.split('\n');
	const obj = {};

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

function credsToSDPStr(creds, mid) {
	const remoteDesc =
		`v=0\r\n` +
		`o=- ${randomSessionId()} 2 IN IP4 127.0.0.1\r\n` +
		`s=-\r\n` +
		`t=0 0\r\n` +
		`a=group:BUNDLE ${mid}\r\n` +
		`a=msid-semantic: WMS *\r\n` +
		`m=application 9 DTLS/SCTP 5000\r\n` +
		`c=IN IP4 0.0.0.0\r\n` +
		`b=AS:30\r\n` +
		`a=ice-ufrag:${creds.ice_ufrag}\r\n` +
		`a=ice-pwd:${creds.ice_pwd}\r\n` +
		`a=ice-options:trickle\r\n` +
		`a=fingerprint:${creds.fingerprint}\r\n` +
		`a=setup:active\r\n` +
		`a=mid:${mid}\r\n` +
		`a=sendrecv\r\n` +
		`a=sctpmap:5000 webrtc-datachannel 256\r\n` +
		`a=max-message-size:1073741823\r\n`;

	return remoteDesc;
}

function candidateToCandidateStr(candidate, theirCreds) {
	const foundation = 2395300328;
	const priority = 2113937151;
	const type = candidate.from_stun ? 'srflx' : 'host';

	return `candidate:${foundation} 1 udp ${priority} ${candidate.candidate_ip} ` +
		`${candidate.candidate_port} typ ${type} generation 0 ufrag ${theirCreds.ice_ufrag} network-cost 50`;
}

export class RTC {
	constructor(serverOffer, attemptId, onCandidate, iceServers = []) {
		this.onCandidate = onCandidate;
		this.attemptId = attemptId;
		this.serverOffer = serverOffer;
		this.started = null;
		this.sdp = null;
		this.rtc = null;
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
		});

		this.rtc.onicecandidate = (event) => {
			if (event.candidate) {
				console.info('candidate', event.candidate);
				const carray = event.candidate.candidate.replace('candidate:', '').split(' ');

				if (carray[2].toLowerCase() === 'udp') {
					this.onCandidate(JSON.stringify(event.candidate));
				} else {
					console.warn('ignoring non-udp candidate', event.candidate.candidate);
				}
			}
		};
	}

	close() {
		for (const kv of Object.entries(this.channels))
			kv[1].close();

		this.rtc.close();
	}

	addChannel(name, id, onOpen, onMessage) {
		this.channels[id] = this.rtc.createDataChannel(name, {id});
		this.channels[id].binaryType = 'arraybuffer';
		this.channels[id].onopen = onOpen;
		this.channels[id].onmessage = onMessage;
	}

	setChannel(id, channel) {
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
		if ("configureRTC" in this) {
			this.configureRTC(this.rtc);
		}
		this.offer = await this.rtc.createAnswer();
		this.sdp = sdpToObj(this.offer);
		return this.offer;
	}

	send(buf, id) {
		this.channels[id].send(buf);
	}

	async setRemoteCandidate(candidate, theirCreds) {
		console.log('setRemoteCandidate', candidate, theirCreds);
		if (this.started === null) {
			this.started = new Promise(async (resolve, reject) => {
				try {
					//this will begin STUN
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
