export enum Warning {
	PeerGone = 99,
	Declined = 8,
};

export enum Msg {
	Kb         = 0,
	Mouse      = 1,
	MouseWheel = 2,
	Motion     = 3,
	Button     = 4,
	Axis       = 5,
	Unplug     = 6,
	Config     = 8,
	Cursor     = 9,
	Abort      = 10,
	Init       = 11,
	Reinit     = 13,
	Shutter    = 16,
	Chat       = 17,
	Status     = 18,
	Block      = 19,
	Ping       = 20,
	Launch     = 21,
};

export const Mapping: {[btn: number]: number} = {
	0  : 0,
	1  : 1,
	2  : 2,
	3  : 3,
	4  : 9,
	5  : 10,
	8  : 4,
	9  : 6,
	10 : 7,
	11 : 8,
	12 : 11,
	13 : 12,
	14 : 13,
	15 : 14,
};

export enum CursorFlags {
	UpdateWarp    = 0x0001,
	UpdateImage   = 0x0002,
	UpdateMode    = 0x0004,
	IsRelative    = 0x0100,
	IsHidden      = 0x0200,
	IsTransparent = 0x0400,
};

export const Scancodes: {[code: string]: number} = {
	KeyA: 4,
	KeyB: 5,
	KeyC: 6,
	KeyD: 7,
	KeyE: 8,
	KeyF: 9,
	KeyG: 10,
	KeyH: 11,
	KeyI: 12,
	KeyJ: 13,
	KeyK: 14,
	KeyL: 15,
	KeyM: 16,
	KeyN: 17,
	KeyO: 18,
	KeyP: 19,
	KeyQ: 20,
	KeyR: 21,
	KeyS: 22,
	KeyT: 23,
	KeyU: 24,
	KeyV: 25,
	KeyW: 26,
	KeyX: 27,
	KeyY: 28,
	KeyZ: 29,
	Digit1: 30,
	Digit2: 31,
	Digit3: 32,
	Digit4: 33,
	Digit5: 34,
	Digit6: 35,
	Digit7: 36,
	Digit8: 37,
	Digit9: 38,
	Digit0: 39,
	Enter: 40,
	Escape: 41,
	Backspace: 42,
	Tab: 43,
	Space: 44,
	Minus: 45,
	Equal: 46,
	BracketLeft: 47,
	BracketRight: 48,
	Backslash: 49,
	Semicolon: 51,
	Quote: 52,
	Backquote: 53,
	Comma: 54,
	Period: 55,
	Slash: 56,
	CapsLock: 57,
	F1: 58,
	F2: 59,
	F3: 60,
	F4: 61,
	F5: 62,
	F6: 63,
	F7: 64,
	F8: 65,
	F9: 66,
	F10: 67,
	F11: 68,
	F12: 69,
	PrintScreen: 70,
	ScrollLock: 71,
	Pause: 72,
	Insert: 73,
	Home: 74,
	PageUp: 75,
	Delete: 76,
	End: 77,
	PageDown: 78,
	ArrowRight: 79,
	ArrowLeft: 80,
	ArrowDown: 81,
	ArrowUp: 82,
	NumLock: 83,
	NumpadDivide: 84,
	NumpadMultiply: 85,
	NumpadEnter: 86,
	NumpadPlus: 87,
	NumpadMinus: 88,
	Numpad1: 89,
	Numpad2: 90,
	Numpad3: 91,
	Numpad4: 92,
	Numpad5: 93,
	Numpad6: 94,
	Numpad7: 95,
	Numpad8: 96,
	Numpad9: 97,
	Numpad0: 98,
	NumpadPeriod: 99,
	ContextMenu: 101,
	ControlLeft: 224,
	ShiftLeft: 225,
	AltLeft: 226,
	MetaLeft: 227,
	ControlRight: 228,
	ShiftRight: 229,
	AltRight: 230,
	MetaRight: 231,
};
