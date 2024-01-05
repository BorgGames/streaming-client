// Util modules
import * as Enum from './enum.js';


/*** PACKING ***/

const CONTROL_SIZE = 13;

export interface IControlMessage {
	type: Enum.Msg;
	data0: number;
	data1: number;
	data2: number;
	str?: string;
}

export interface ICursorMessage extends IControlMessage {
	w: number;
	h: number;
	x: number;
	y: number;
	hotX: number;
	hotY: number;
	relative: boolean;
	hidden: boolean;
	data: string | null;
}

function packControl(buf: ArrayBuffer, type: Enum.Msg, data0: number, data1: number, data2: number) {
	const dest = new DataView(buf);
	dest.setInt8(0, type);
	dest.setInt32(1, data0);
	dest.setInt32(5, data1);
	dest.setInt32(9, data2);
}

function packString(buf: ArrayBuffer, offset: number, str: string) {
	const enc = new TextEncoder();
	const strBuf = enc.encode(str);

	const dest = new Int8Array(buf, offset);

	for (let x = 0; x < str.length; x++)
		dest[x] = strBuf[x];
}

function control(type: Enum.Msg, data0: number, data1: number, data2: number) {
	const buf = new ArrayBuffer(CONTROL_SIZE);
	packControl(buf, type, data0, data1, data2);

	return buf;
}

function strMsg(type: Enum.Msg.Chat | Enum.Msg.Status | Enum.Msg.Config, str: string) {
	const buf = new ArrayBuffer(CONTROL_SIZE + str.length + 1);

	packControl(buf, type, str.length + 1, 0, 0);
	packString(buf, CONTROL_SIZE, str);

	return buf;
}

export function motion(relative: boolean, x: number, y: number) {
	return control(Enum.Msg.Motion, Number(relative), x, y);
}

export function mouse(btn: number, down: boolean) {
	return control(Enum.Msg.Mouse, btn, Number(down), 0);
}

export function kb(code: number, mod: number, down: boolean) {
	return control(Enum.Msg.Kb, code, mod, Number(down));
}

export function mouseWheel(deltaX: number, deltaY: number, deltaZ: number) {
	return control(Enum.Msg.MouseWheel, deltaX, deltaY, deltaZ);
}

export function button(btn: number, pressed: number, index: number) {
	return control(Enum.Msg.Button, btn, pressed, index);
}

export function axis(axs: number, value: number, index: number) {
	return control(Enum.Msg.Axis, axs, value, index);
}

export function unplug(index: number) {
	return control(Enum.Msg.Unplug, 0, 0, index);
}

export function init() {
	return control(Enum.Msg.Init, 0, 0, 0);
}

export function launch() {
	return control(Enum.Msg.Launch, 0, 0, 0);
}

export function block() {
	return control(Enum.Msg.Block, 0, 0, 0);
}

export function reinit() {
	return control(Enum.Msg.Reinit, 0, 0, 0);
}

export function abort(reason: number) {
	return control(Enum.Msg.Abort, reason, 0, 0);
}

export function ping(tag: number) {
	return control(Enum.Msg.Ping, tag, 0, 0);
}

function serializeConfig(cfg: any) {
	return JSON.stringify(cfg, null, 0);
}

export function config(cfg: any) {
	return strMsg(Enum.Msg.Config, serializeConfig(cfg));
}


/*** UNPACKING ***/

function unpackControl(view: DataView): IControlMessage {
	const type = view.getInt8(0); 
	return {
		type,
		data0: view.getInt32(1),
		data1: view.getInt32(5),
		data2: view.getInt32(9),
	};
}

function unpackCursor(view: DataView) {
	const dataLen = view.getInt32(13);
	const flags = view.getInt16(29);

	return {
		w: view.getInt16(17),
		h: view.getInt16(19),
		x: view.getInt16(21),
		y: view.getInt16(23),
		hotX: view.getInt16(25),
		hotY: view.getInt16(27),
		relative: !!(flags & Enum.CursorFlags.IsRelative),
		hidden: !!(flags & Enum.CursorFlags.IsHidden),
		data: flags & Enum.CursorFlags.UpdateImage ?
			btoa(String.fromCharCode(...new Uint8Array(view.buffer, 31, dataLen - 1))) : null,
	};
}

function unpackString(buf: ArrayBufferLike, offset: number, len: number) {
	const dec = new TextDecoder();
	const strBuf = new Int8Array(buf, offset, len);

	return dec.decode(strBuf);
}

export function unpack(buf: ArrayBufferLike): IControlMessage {
	const view = new DataView(buf);
	const msg = unpackControl(view);

	switch (msg.type) {
		case Enum.Msg.Cursor:
			return {...msg, ...unpackCursor(view)};

		case Enum.Msg.Status:
		case Enum.Msg.Chat:
			return {...msg, str: unpackString(buf, CONTROL_SIZE, msg.data0 - 1)};
	}

	return msg;
}
