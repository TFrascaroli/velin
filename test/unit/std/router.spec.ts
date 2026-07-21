import { describe, it, expect, beforeEach, vi } from "vitest";
import Velin from "../../../src/velin-all";

describe("Velin Router", () => {
  let root: HTMLElement;
  beforeEach(() => {
    root = document.createElement("div");
    document.body.appendChild(root);
  });

  it("should sync URL with state using vln-router", () => {
    root.setAttribute("vln-router", "myRoute");
    const state = Velin.bind(root, {});

    expect(Velin.ø__internal.getWrapper(state)!.state.myRoute).toBeDefined();
    expect(Velin.ø__internal.getWrapper(state)!.state.myRoute.path).toBe(window.location.pathname);
  });

  it("should conditionally render based on vln-route", async () => {
    root.innerHTML = `
      <div vln-router="myRoute">
        <div id="target" vln-route="'/other'">Content</div>
      </div>
    `;
    
    const state = Velin.bind(root, {
      myRoute: { path: '/test-route', params: {}, query: {}, error: null, loading: false }
    });

    expect(root.querySelector("#target")).toBeNull();

    Velin.ø__internal.getWrapper(state)!.state.myRoute.path = '/other';
    Velin.ø__internal.triggerEffects('root.myRoute.path', Velin.ø__internal.getWrapper(state)!);
    
    await new Promise(resolve => setTimeout(resolve, 50));
    
    const target = root.querySelector("#target");
    expect(target).not.toBeNull();
    expect(target?.textContent).toBe("Content");
  });

  it("should handle dynamic route parameters", async () => {
    // Set the hash manually to match
    window.location.hash = '/user/123';
    
    root.innerHTML = `
      <div vln-router="myRoute">
        <div id="target" vln-route="'/user/:id'">Content</div>
      </div>
    `;
    
    // Initialize without pre-setting path in state, let router plugin initialize it from hash
    Velin.bind(root, { myRoute: {} });
    
    await new Promise(resolve => setTimeout(resolve, 50));
    
    const target = root.querySelector("#target");
    expect(target).not.toBeNull();
  });

  it("should reset scroll position on route change via vln-router-scroll", async () => {
    // Land at a known hash so the router doesn't self-mutate path on init.
    window.location.hash = '/';

    // Build a scroll container that owns the scroll (fixed height + overflow),
    // with two routes whose content is much taller than the container so
    // scrolling is meaningful.
    const tallContent = (label: string) =>
      Array.from({ length: 200 }, (_, i) => `<p>${label} paragraph ${i}</p>`).join("");

    root.style.height = "300px";
    root.style.overflow = "auto";
    root.setAttribute("vln-router-scroll", "myRoute");
    root.innerHTML = `
      <div vln-router="myRoute">
        <div vln-route="'/'">${tallContent("Home")}</div>
        <div vln-route="'/other'">${tallContent("Other")}</div>
      </div>
    `;

    // Track scrollTo calls without breaking the fallback path either.
    const scrollToCalls: Array<[number, number]> = [];
    (root as any).scrollTo = (x: number, y: number) => {
      scrollToCalls.push([x, y]);
      root.scrollTop = y;
      root.scrollLeft = x;
    };

    const state = Velin.bind(root, {
      myRoute: { path: '/', params: {}, query: {}, error: null, loading: false }
    });
    await new Promise(resolve => setTimeout(resolve, 20));

    // Initial mount must NOT scroll — we haven't navigated yet.
    expect(scrollToCalls.length).toBe(0);

    // Simulate a user scrolled deep into the current route, and confirm
    // the container actually holds that scroll position before we navigate.
    root.scrollTop = 1234;
    expect(root.scrollTop).toBeGreaterThan(0);

    // Commit a real route change.
    Velin.ø__internal.getWrapper(state)!.state.myRoute.path = '/other';
    Velin.ø__internal.triggerEffects('root.myRoute.path', Velin.ø__internal.getWrapper(state)!);
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(scrollToCalls.length).toBe(1);
    expect(scrollToCalls[0]).toEqual([0, 0]);
    expect(root.scrollTop).toBe(0);

    // Re-committing the same path should NOT re-scroll (path didn't change).
    root.scrollTop = 500;
    Velin.ø__internal.triggerEffects('root.myRoute.path', Velin.ø__internal.getWrapper(state)!);
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(scrollToCalls.length).toBe(1);
    expect(root.scrollTop).toBe(500);
  });

  it("should provide navigateTo function", () => {
    root.setAttribute("vln-router", "myRoute");
    const state = Velin.bind(root, {});

    const routeState = Velin.ø__internal.getWrapper(state)!.state.myRoute;
    expect(typeof routeState.navigateTo).toBe("function");
    
    routeState.navigateTo('/new-path');
    expect(window.location.hash).toBe('#/new-path');
  });

});
