# Hydrating Velin from a server-rendered page

Velin was built for the script-tag case, which includes the huge
population of pages that are *already* server-rendered — Blade, ERB,
WordPress, Hugo, anything that spits HTML. You don't need SSR support
as a feature; you already have it. This page shows the pattern.

## The pattern

Your server does one job it already does: render the initial HTML.
Give it one more small job: emit the same data as a JSON blob in the
page. Then on the client, pass the blob to `Velin.bind` and you're
done — Velin owns the DOM from there on.

Because `Velin.bind` runs synchronously, the browser cannot paint
between the walk starts and finishes. If the state you seed matches
what the server rendered, the first write produces the exact same
DOM: no flash, no re-flow, no adopt-and-diff dance. State and markup
came from the same request, so they agree by construction.

## Blade (Laravel)

```blade
<div id="app">
  <h1 vln-text="'Hello, ' + user.name"></h1>
  <p vln-text="'Posts: ' + user.posts">Posts: {{ $user->posts }}</p>
  <input vln-input="user.name" />
</div>

<script id="app-data" type="application/json">
  @json(['user' => $user])
</script>
<script src="https://unpkg.com/@velinjs/all/velin-common.min.js"></script>
<script>
  const state = JSON.parse(document.getElementById('app-data').textContent);
  Velin.bind(document.getElementById('app'), state);
</script>
```

## ERB (Rails)

```erb
<div id="app">
  <h1 vln-text="'Hello, ' + user.name"></h1>
  <p vln-text="'Posts: ' + user.posts">Posts: <%= @user.posts %></p>
  <input vln-input="user.name" />
</div>

<script id="app-data" type="application/json">
  <%= { user: @user }.to_json.html_safe %>
</script>
<script src="https://unpkg.com/@velinjs/all/velin-common.min.js"></script>
<script>
  const state = JSON.parse(document.getElementById('app-data').textContent);
  Velin.bind(document.getElementById('app'), state);
</script>
```

## WordPress

Use `wp_localize_script` to hand data to the client — it JSON-encodes
safely and puts the object on `window` before your script runs.

```php
// functions.php (or your plugin)
wp_enqueue_script('velin', 'https://unpkg.com/@velinjs/all/velin-common.min.js', [], null, true);
wp_enqueue_script('app', get_template_directory_uri() . '/js/app.js', ['velin'], null, true);
wp_localize_script('app', 'APP_DATA', [
  'user' => ['name' => wp_get_current_user()->display_name, 'posts' => 3],
]);
```

```html
<!-- template -->
<div id="app">
  <h1 vln-text="'Hello, ' + user.name"></h1>
  <p vln-text="'Posts: ' + user.posts">Posts: 3</p>
</div>
```

```js
// js/app.js
Velin.bind(document.getElementById('app'), APP_DATA);
```

## Hugo (or any static-site generator)

```html
<div id="app">
  <h1 vln-text="'Hello, ' + user.name"></h1>
  <p vln-text="'Posts: ' + user.posts">Posts: {{ .Params.user.posts }}</p>
</div>

<script id="app-data" type="application/json">
  {{ .Params.user | jsonify }}
</script>
<script src="https://unpkg.com/@velinjs/all/velin-common.min.js"></script>
<script>
  const user = JSON.parse(document.getElementById('app-data').textContent);
  Velin.bind(document.getElementById('app'), { user });
</script>
```

## What to watch for

**You write the value twice.** Once in the server template
(`{{ $user->posts }}`, `<%= @user.posts %>`, etc.) so the first paint
is correct, and once in the Velin expression (`vln-text="user.posts"`)
so it stays correct after that. That duplication is the price of the
pattern — it's what avoids the flash. Keep the two in sync or drop
the server-side value and accept an empty initial paint.

**Don't bind before you have the data.** The anti-pattern is:

```js
// don't
const state = Velin.bind(root, { user: null });
fetch('/api/user').then(u => state.user = u);
```

That paints once with `null`, then again with the real user — the
"flash of undefined." If the data isn't in the page yet, wait for it
before calling `bind`, or seed with values you're happy to show.

## What Velin doesn't try to do

Velin doesn't adopt or diff server-rendered DOM. After `bind`, the
library owns the element and rewrites its contents from state. The
handoff is only seamless when state and HTML came from the same
source in the same request. If they didn't, you'll see the mismatch
on the first write — and that's a caller bug, not something the
library papers over.
