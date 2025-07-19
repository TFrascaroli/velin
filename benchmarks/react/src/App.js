import React, { useState, useEffect, useRef } from "react";

export default function App() {
  const [newSize, setNewSize] = useState(100);
  const [outerSize, setOuterSize] = useState(100);
  const [dots, setDots] = useState([]);
  const [running, setRunning] = useState(false);
  const [time, setTime] = useState(1000);
  const alpha = 0.1;
  const rafId = useRef(null);

  function shuffle(array) {
    let currentIndex = array.length;
    while (currentIndex != 0) {
      let randomIndex = Math.floor(Math.random() * currentIndex);
      currentIndex--;
      [array[currentIndex], array[randomIndex]] = [
        array[randomIndex],
        array[currentIndex],
      ];
    }
  }
  function update(n, m) {
    const newDots = [];
    for (let i = 0; i < n; i++) {
      const innerLen = Math.floor(Math.random() * (m * 0.1) + m * 0.9);
      newDots.push(Array.from({ length: innerLen }, () => Math.random()));
    }
    shuffle(newDots);
    setDots(newDots);
  }

  const loop = () => {
    const start = performance.now();
    update(newSize, 100);
    rafId.current = requestAnimationFrame(() => {
      const elapsed = performance.now() - start;
      setTime((prev) => (1 - alpha) * prev + alpha * elapsed);
      if (running) loop();
    });
  };

  useEffect(() => {
    if (running) loop();
    else {
      cancelAnimationFrame(rafId.current);
      setDots([]);
    }
    return () => cancelAnimationFrame(rafId.current);
  }, [running]);

  return (
    <div className="bg-gray-900 text-gray-100 p-6 font-sans min-h-screen">
      <div className="top-bar flex justify-between items-center mb-4 flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <label htmlFor="sizeInput" className="sr-only">
            Grid size
          </label>
          <input
            id="sizeInput"
            type="number"
            min="1"
            value={newSize}
            onChange={(e) => setNewSize(+e.target.value)}
            className="bg-gray-800 text-white px-2 py-1 rounded border border-gray-700"
          />
          <button
            onClick={() => setOuterSize(newSize)}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1 rounded"
          >
            Update size
          </button>
        </div>

        <div>
          <button
            onClick={() => setRunning((r) => !r)}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1 rounded"
          >
            {running ? "Stop" : "Start"}
          </button>
        </div>

        <div>
          <button
            onClick={() => update(newSize, 100)}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1 rounded"
          >
            Cycle once
          </button>
        </div>

        <div className="text-sm text-gray-400">
          {Math.floor(1000 / time)} FPS
        </div>
      </div>

      <div className="grid-container grid gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
        {dots.map((square, i) => (
          <div key={i} className="square bg-gray-800 p-2 rounded">
            <div className="flex flex-wrap gap-1">
              {square.map((_, j) => (
                <div
                  key={j}
                  className="dot w-2 h-2 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500"
                ></div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
