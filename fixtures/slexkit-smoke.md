# SlexKit HTML-first smoke test

These are three independent `slex` fences. Each fence is an isolated document;
they exchange only JSON values through the artifact-local `slex.shared` API.

```slex
<slex-card title="Control panel" data-key="controls">
  <slex-input id="color" label="Color" value="blue"></slex-input>
  <slex-slider id="size" label="Font size" value="20" min="8" max="48" step="2"></slex-slider>
</slex-card>
<script type="module">
  const color = slex.root.querySelector("#color");
  const size = slex.root.querySelector("#size");
  const publish = () => slex.shared.set("appearance", {
    color: color.value,
    size: Number(size.value),
  });
  color.addEventListener("input", publish);
  size.addEventListener("input", publish);
  publish();
</script>
```

## Observer A

~~~slex
<slex-stat id="color" label="Color" value="waiting"></slex-stat>
<slex-stat id="size" label="Font size" value="waiting" unit="px"></slex-stat>
<script type="module">
  const render = value => {
    if (!value) return;
    slex.root.querySelector("#color").value = value.color;
    slex.root.querySelector("#size").value = value.size;
  };
  render(slex.shared.get("appearance"));
  slex.onDispose(slex.shared.subscribe("appearance", render));
</script>
~~~

## Observer B

```slex
<slex-card title="Live preview" data-key="preview">
  <p id="sample">HTML-first SlexKit</p>
</slex-card>
<script type="module">
  const sample = slex.root.querySelector("#sample");
  const render = value => {
    if (!value) return;
    sample.style.color = value.color;
    sample.style.fontSize = `${value.size}px`;
  };
  render(slex.shared.get("appearance"));
  slex.onDispose(slex.shared.subscribe("appearance", render));
</script>
```

Expected result: both observer fences update, ordinary Markdown remains inert,
and switching reading/Live Preview surfaces keeps the same committed frames.
