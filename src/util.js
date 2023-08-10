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
	return new Promise((_, reject) => {
		setTimeout(()=> reject('timeout'), time_ms);
	});
}