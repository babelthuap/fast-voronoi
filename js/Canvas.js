export default class Canvas {
  constructor(initialColor = 'white') {
    this.root_ = document.createElement('canvas');
    this.root_.width = this.width = window.innerWidth;
    this.root_.height = this.height = window.innerHeight;
    this.ctx_ = this.root_.getContext('2d');
    this.ctx_.fillStyle = initialColor;
    this.ctx_.fillRect(0, 0, this.width, this.height);
    this.imageData_ = this.ctx_.getImageData(0, 0, this.width, this.height);
    this.data_ = this.imageData_.data;
  }

  attachToDom() {
    if (document.body.children[0] !== this.root_) {
      [...document.body.children].forEach(child => child.remove());
      document.body.appendChild(this.root_);
    }
  }

  repaint() {
    this.ctx_.putImageData(this.imageData_, 0, 0);
  }

  setPixel(pixelIndex, rgb) {
    const red = pixelIndex << 2;
    this.data_[red] = rgb[0];
    this.data_[red + 1] = rgb[1];
    this.data_[red + 2] = rgb[2];
  }

  addEventListener(...args) {
    this.root_.addEventListener(...args);
  }

  removeEventListener(...args) {
    this.root_.removeEventListener(...args);
  }
}
