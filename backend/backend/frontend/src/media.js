// frontend/src/media.js
// Put your pictures and videos in:  frontend/public/images/
// Use the file names below (any of the listed extensions works).
// If a file is missing, the page shows a dashed box that tells you what to add.
// Edit "alt" so it truthfully describes your own photo/video (screen reader users hear this text).
const pic = (name) => ['jpg', 'jpeg', 'png', 'webp'].map((e) => `/images/${name}.${e}`);
const vid = (name) => ['mp4', 'webm'].map((e) => `/images/${name}.${e}`);

export const SLOTS = {
  hero: {
    type: 'image', src: [...pic('hero'), '/images/disablelove.jpg'], size: '1600 x 1000 px, JPG',
    alt: 'People of different abilities supporting each other',
    hint: 'A warm photo of diverse people together: a wheelchair user, a person with a white cane, people using sign language.',
  },
  welcome: {
    type: 'video', src: vid('welcome'), captions: '/images/welcome.vtt', poster: '/images/welcome-poster.jpg', size: 'MP4, 30-60 seconds',
    alt: 'Welcome video with a sign language interpreter and captions',
    hint: 'A short welcome video with a South African Sign Language interpreter. Also add welcome.vtt (captions).',
  },
  about: {
    type: 'image', src: [...pic('about'), '/images/alone.jpg'], size: '1200 x 900 px, JPG',
    alt: 'A person using assistive technology',
    hint: 'A person using a screen reader, braille display or voice control on a laptop or phone.',
  },
  places: {
    type: 'image', src: pic('places'), size: '1400 x 700 px, JPG',
    alt: 'An accessible building entrance with a ramp',
    hint: 'An accessible building entrance: a ramp, automatic door or lift.',
  },
  education: {
    type: 'image', src: pic('education'), size: '1400 x 700 px, JPG',
    alt: 'Learners in an inclusive classroom or computer lab',
    hint: 'Learners of different abilities in a classroom or computer lab.',
  },
  employment: {
    type: 'image', src: pic('employment'), size: '1400 x 700 px, JPG',
    alt: 'Colleagues working together in an inclusive workplace',
    hint: 'Colleagues working together in an inclusive workplace.',
  },
  support: {
    type: 'image', src: pic('support'), size: '1400 x 700 px, JPG',
    alt: 'A support worker helping a person at a community centre',
    hint: 'A support worker or counsellor helping someone at a community centre.',
  },
  report: {
    type: 'image', src: pic('report'), size: '1400 x 700 px, JPG',
    alt: 'A person pointing out an accessibility barrier',
    hint: 'A person pointing at a barrier (a step without a ramp, a blocked pavement).',
  },
  sasl: {
    type: 'video', src: vid('sasl-intro'), captions: '/images/sasl-intro.vtt', poster: '/images/sasl-poster.jpg', size: 'MP4, 1-3 minutes',
    alt: 'Introduction to South African Sign Language with captions',
    hint: 'A short South African Sign Language (SASL) lesson or greeting video, filmed with a qualified signer. Add sasl-intro.vtt (captions).',
  },
  help: {
    type: 'image', src: pic('help'), size: '1400 x 700 px, JPG',
    alt: 'A friendly helpline or support desk',
    hint: 'A friendly support desk, phone or helper.',
  },
};