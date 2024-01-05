declare global {
	interface Array<T> {
		removeByValue(value: T): boolean;
	}
}
Array.prototype.removeByValue = function (value): boolean {
	const index = this.indexOf(value);
	if (index === -1)
		return false;

	this.splice(index, 1);
	return true;
}

export interface IUtilListener {
	obj: EventTarget;
	name: string;
	func: any;
}


export function addListener(obj: EventTarget, name: string, func: any, ctx?: any): IUtilListener {
	const newFunc = ctx ? func.bind(ctx) : func;
	obj.addEventListener(name, newFunc);

	return {obj, name, func: newFunc};
}

export function removeListeners(listeners: IUtilListener[]) {
	for (const listener of listeners)
		listener.obj.removeEventListener(listener.name, listener.func);
}

export function wait(time_ms: number) {
	return new Promise(resolve => {
		setTimeout(resolve, time_ms);
	});
}

export function toggleFullscreen(element: Element) {
	let doc: any = document;
	if (doc.webkitFullscreenElement) {
		doc.webkitExitFullscreen();

	} else {
		if (element.requestFullscreen)
			element.requestFullscreen({ navigationUI: 'hide' });
		else {
			const wkElement = element as any;
			if (wkElement.webkitRequestFullscreen) {
				wkElement.webkitRequestFullscreen();
			}
		}

		const nav = navigator as any;
		if (nav.keyboard && nav.keyboard.lock)
			nav.keyboard.lock();
	}
}

export function timeout(time_ms: number): Promise<any> {
	let rj = null;
	let promise: any = new Promise((_, reject) => {
		rj = reject;
		setTimeout(() => reject('timeout'), time_ms);
	});
	promise.reject = rj;
	return promise;
}