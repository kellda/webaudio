const nodes = {
	dest: {
		name: 'Destination',
		inputs: 1,
		outputs: 0,
		todo: { settings: ['forward', 'position', 'up'] },
		create: ctx => ctx.listener,
	},
	cst: {
		name: 'ConstantSource',
		inputs: 0,
		outputs: 1,
		audioparams: {
			offset: {},
		},
	},
	osc: {
		name: 'Oscillator',
		inputs: 0,
		outputs: 1,
		audioparams: {
			frequency: {},
			detune: {},
		},
		discreteparams: {
			type: ['sine', 'square', 'sawtooth', 'triangle', ['custom', 'hidden']],
		},
		settings: {
			elements: [
				{ label: 'Real / Cosine / A terms', type: 'textarea'},
				{ label: 'Imag / Sine / B terms', type: 'textarea'},
				{ label: 'Disable normalisation', type: 'checkbox' },
			],
			apply: (elt, node, settings) => {
				let real = new Float32Array(settings[0].split(','));
				let imag = new Float32Array(settings[1].split(','));
				settings[3] = node.context.createPeriodicWave(real, imag, { disableNormalization: settings[2] });
				node.setPeriodicWave(settings[3]);
				elt.lastElementChild.lastElementChild.lastElementChild.lastElementChild.selected = true;
			},
			reload: (oldnode, newnode, settings) => {
				if (oldnode.type == 'custom') {
					newnode.setPeriodicWave(settings[3]);
				} else
					newnode.type = oldnode.type;
			}
		},
	},
	buffer: {
		name: 'BufferSource',
		inputs: 0,
		outputs: 1,
		audioparams: {
			detune: {},
			playbackRate: {},
		},
		continuousparams: {
			loopStart: { min: '', max: '', initial: 0 },
			loopEnd: { min: '', max: '', initial: 0 },
		},
		booleanparams: {
			loop: false,
		},
		settings: {
			elements: [
				{ label: 'Audio Buffer', type: 'buffer' },
			],
			apply: (elt, node, settings) => {
				let img = elt.children[1].firstElementChild;
				switch (settings[0].type) {
				case 'none':
						img.src = img.src.replace(/#.*$/, '#none');
						img.dataset.type = 'settings';
						node.buffer = null;
						return;
				case 'loading':
						img.src = img.src.replace(/#.*$/, '#loading');
						img.dataset.type = '';
						node.buffer = null;
						return;
				case 'loaded':
						img.src = img.src.replace(/#.*$/, '#play');
						img.dataset.type = 'start';
						return;
				case 'new':
						return;
				}
			},
		},
	},
	buffer_raw: {
		settings: {
			elements: [
				{ label: 'Name', type: 'text' },
				{ label: 'Raw data (one line per channel)', type: 'textarea'},
				{ label: 'Sample rate', type: 'number' },
			],
			make: (ctx, settings) => {
				let channels = settings[1].split('\n');
				let buffer = ctx.createBuffer(
					channels.length,
					channels[0].split(',').length,
					settings[2],
				);
				for (let i in channels)
					buffer.copyToChannel(new Float32Array(channels[i].split(',')), i);
				return Promise.resolve(buffer);
			},
		},
	},
	buffer_file: {
		settings: {
			elements: [
				{ label: 'Name', type: 'text' },
				{ label: 'File', type: 'file'},
			],
			make: (ctx, settings) => settings[1].arrayBuffer().then(buffer => ctx.decodeAudioData(buffer)),
		},
	},
	media: {
		name: 'MediaElementSource',
		inputs: 0,
		outputs: 1,
		todo: { mediaElement: HTMLMediaElement },
	},
	stream: {
		name: 'MediaStreamSource',
		inputs: 0,
		outputs: 1,
		todo: { mediaStream: MediaStream },
	},
	track: {
		name: 'MediaStreamTrackSource',
		todo: { track: MediaStreamTrack },
	},
	strdest: {
		name: 'MediaStreamDestination',
		todo: { stream: MediaStream },
	},
	gain: {
		name: 'Gain',
		inputs: 1,
		outputs: 1,
		audioparams: {
			gain: {},
		},
	},
	delay: {
		name: 'Delay',
		inputs: 1,
		outputs: 1,
		audioparams: {
			delayTime: {},
		},
		settings: {
			elements: [
				{ label: 'Maximum time', type: 'number', min: 0, max: 180, initial: 1 },
			],
			apply: (elt, node, settings) => {
				elt.lastElementChild.lastElementChild.lastElementChild.max = settings[0];
				return [settings[0]];
			},
		},
	},
	stereo: {
		name: 'StereoPanner',
		inputs: 1,
		outputs: 1,
		audioparams: {
			pan: {},
		},
	},
	panner: {
		name: 'Panner',
		inputs: 1,
		outputs: 1,
		audioparams: {
			orientationX: {},
			orientationY: {},
			orientationZ: {},
			positionX: {},
			positionY: {},
			positionZ: {},
		},
		continuousparams: {
			coneInnerAngle: { min: '', max: '', initial: 360 },
			coneOuterAngle: { min: '', max: '', initial: 0 },
			coneOuterGain: { min: 0, max: 1, initial: 0 },
			maxDistance: { min: 0, max: '', initial: 10000 },
			refDistance: { min: 0, max: '', initial: 1 },
			rolloffFactor: { min: 0, max: '', initial: 1 },
		},
		discreteparams: {
			distanceModel: ['linear', ['inverse', 'selected'], 'exponential'],
			panningModel: ['equalpower', 'HRTF'],
		},
	},
	biquad: {
		name: 'BiquadFilter',
		inputs: 1,
		outputs: 1,
		audioparams: {
			frequency: {},
			detune: {},
			Q: {},
			gain: {},
		},
		discreteparams: {
			type: ['lowpass', 'highpass', 'band-pass', 'lowshelf', 'highshelf', 'peaking', 'notch', 'allpass'],
		},
		settings: {
			elements: [
				{ label: 'Show frequency response', type: 'checkbox' },
			],
			apply: (elt, node, settings) => todo = 'getFrequencyResponse',
		},
	},
	iir: {
		name: 'IIRFilter',
		inputs: 1,
		outputs: 1,
		settings: {
			elements: [
				{ label: 'Feedforward', type: 'textarea'},
				{ label: 'Feedback', type: 'textarea'},
				{ label: 'Show frequency response', type: 'checkbox', todo: true },
			],
			apply: (elt, node, settings) => [settings[0].split(','), settings[1].split(',')],
		},
		create: (ctx) => ctx.createIIRFilter([1], [1]),
	},
	compr: {
		name: 'DynamicsCompressor',
		inputs: 1,
		outputs: 1,
		audioparams: {
			threshold: {},
			knee: {},
			ratio: {},
			attack: {},
			release: {},
		},
		todo: { reduction: 'read' },
	},
	conv: {
		name: 'Convolver',
		inputs: 1,
		outputs: 1,
		booleanparams: {
			normalize: true,
		},
		settings: {
			elements: [
				{ label: 'Audio Buffer', type: 'buffer' },
			],
			apply: (elt, node, settings) => {
				if (settings[0].type != 'new') node.buffer = settings[0].buffer;
			},
		},
	},
	shaper: {
		name: 'WaveShaper',
		inputs: 1,
		outputs: 1,
		discreteparams: {
			oversample: ['none', '2x', '4x'],
		},
		settings: {
			elements: [
				{ label: 'Curve', type: 'textarea'},
			],
			apply: (elt, node, settings) => { node.curve = new Float32Array(settings[0].split(',')); }
		},
	},
	split: {
		name: 'ChannelSplitter',
		inputs: 1,
		outputs: 6,
		settings: {
			elements: [
				{ label: 'Outputs', type: 'number', min: 1, initial: 6 },
			],
			apply: (elt, node, settings) => {
				let list = elt.children[1].children[2];
				if (list.childElementCount < settings[0]) {
					let img = list.firstElementChild;
					while (list.childElementCount < settings[0])
						list.appendChild(img.cloneNode());
				} else {
					while (list.childElementCount > settings[0])
						list.removeChild(list.lastElementChild);
				}
				return [settings[0]];
			},
		},
	},
	merger: {
		name: 'ChannelMerger',
		inputs: 6,
		outputs: 1,
		settings: {
			elements: [
				{ label: 'Inputs', type: 'number', min: 1, initial: 6 },
			],
			apply: (elt, node, settings) => {
				let list = elt.children[1].children[0];
				if (list.childElementCount < settings[0]) {
					let img = list.firstElementChild;
					while (list.childElementCount < settings[0])
						list.appendChild(img.cloneNode());
				} else {
					while (list.childElementCount > settings[0])
						list.removeChild(list.lastElementChild);
				}
				return [settings[0]];
			},
		},
	},
	analy: {
		name: 'Analyser',
		inputs: 1,
		outputs: 1,
		continuousparams: {
			minDecibels: { min: '', max: 0, initial: -100 },
			maxDecibels: { min: '', max: 0, initial: -30 },
			smoothingTimeConstant: { min: 0, max: 1, initial: 0.8 },
			},
		discreteparams: {
			fftSize: ['32', '64', '128', '256', '512', '1024', ['2048', 'selected'], '4096', '8192', '16384', '32768'],
		},
		todo: { get__Data: ['Float', 'Byte', 'Frequency', 'TimeDomain'] },
	},
};
