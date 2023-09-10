Array.prototype.removeByValue = function(value) {
	const index = this.indexOf(value);
	if (index === -1)
		return false;

	this.splice(index, 1);
	return true;
}

export function addListener(obj, name, func, ctx) {
	const newFunc = ctx ? func.bind(ctx) : func;
	obj.addEventListener(name, newFunc);

	return [obj, name, newFunc];
}

export function removeListeners(listeners) {
	for (const listener of listeners)
		listener[0].removeEventListener(listener[1], listener[2]);
}

export function wait(time_ms) {
	return new Promise(resolve => {
		setTimeout(resolve, time_ms);
	});
}

export function toggleFullscreen(element) {
	if (document.webkitFullscreenElement) {
		document.webkitExitFullscreen();

	} else {
		element.webkitRequestFullscreen();

		if (navigator.keyboard && navigator.keyboard.lock)
			navigator.keyboard.lock();
	}
}

export function timeout(time_ms) {
	let rj = null;
	let promise = new Promise((_, reject) => {
		rj = reject;
		setTimeout(()=> reject('timeout'), time_ms);
	});
	promise.reject = rj;
	return promise;
}