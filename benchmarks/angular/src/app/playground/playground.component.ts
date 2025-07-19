import { CommonModule } from '@angular/common';
import { Component, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-playground',
  templateUrl: './playground.component.html',
  styleUrls: ['./playground.component.css'],
  imports: [
    FormsModule,
  ],
  standalone: true,
})
export class PlaygroundComponent {
  Math = Math;
  newSize = 100;
  outerSize = 100;
  dots: number[][] = [];
  time = 1000;
  running = false;

  private alpha = 0.1;

  update() {
    this.dots = Array.from({ length: this.outerSize }, () => {
      const len = Math.floor(Math.random() * (100 * 0.1) + (100 * 0.9));
      return Array.from({ length: len }, () => Math.random());
    });
  }

  startStop() {
    this.running = !this.running;
    if (this.running) requestAnimationFrame(() => this.loop());
    else this.dots = [];
  }

  cycle() {
    this.update();
  }
  
  private loop() {
    if (!this.running) return;
    const start = performance.now();
  
    this.update(); // modifies data
  
    requestAnimationFrame(() => {
      const elapsed = performance.now() - start;
      this.time = (1 - this.alpha) * this.time + this.alpha * elapsed;
      this.loop(); // only continue after browser rendered
    });
  }
}
