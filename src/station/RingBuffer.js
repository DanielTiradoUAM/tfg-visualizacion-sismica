export default class RingBuffer {
    constructor(capacity) {
        this.capacity = capacity;
        this.buffer = new Array(capacity);
        this.start = 0;
        this.length = 0;
    }

    push(item) {
        const idx = (this.start + this.length) % this.capacity;

        if (this.length < this.capacity) {
            this.buffer[idx] = item;
            this.length++;
        } else {
            this.buffer[idx] = item;
            this.start = (this.start + 1) % this.capacity;
        }
    }

    pushMany(items) {
        for (const item of items) this.push(item);
    }

    toArray() {
        if (this.length === this.capacity) {
            return [...this.buffer.slice(this.start), ...this.buffer.slice(0, this.start)];
        }
        return this.buffer.slice(0, this.length);
    }

    clear() {
        this.start = 0;
        this.length = 0;
    }

    size() {
        return this.length;
    }
}