"""Turn a packed single-file game build into a folder that GitHub Pages can serve.

A packed build is one HTML file that carries every game file as gzip+base64 in
<script type="application/octet-stream" data-file=...> blocks, plus a bootstrap
that serves them from blob URLs. A file that size cannot go into this repository
(GitHub refuses files over 100 MB), so this writes each game file out unchanged
and swaps the bootstrap for a small loader that fetches them from the folder.

    python games/unpack.py games/Radahn-R10.23-Ultra-4K-Playable.zip games/elden

The source may be the .zip or the .html. Files already in the output folder are
overwritten; files the new build no longer has are listed, not deleted.
"""

import base64
import gzip
import os
import re
import sys
import zipfile

PACKED = re.compile(
    r'<script type="application/octet-stream" data-file="([^"]+)" data-mime="[^"]+" data-size="(\d+)">(.*?)</script>\s*',
    re.S,
)
BOOTSTRAP = re.compile(r"<script>\(async function \(\) \{.*?</script>", re.S)

LOADER = """<script>
/* Web loader written by games/unpack.py. The packer pointed import.meta.url at an
   offline host; fetch those paths from this folder instead. */
(() => {
  const OFFLINE = "%(host)s";
  const local = (value) => {
    let url;
    try { url = new URL(value, document.baseURI); } catch { return null; }
    return url.hostname === OFFLINE ? new URL("." + url.pathname + url.search, document.baseURI).href : null;
  };
  const fetchOriginal = window.fetch.bind(window);
  window.fetch = (input, options) => {
    const href = local(typeof input === "string" ? input : input instanceof URL ? input.href : input?.url);
    return href ? fetchOriginal(href, options) : fetchOriginal(input, options);
  };
  const src = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src");
  Object.defineProperty(HTMLImageElement.prototype, "src", { ...src, set(value) { src.set.call(this, local(String(value)) ?? value); } });
})();
</script>
<script type="module">
const box = document.querySelector("#loading");
const status = box.querySelector("small");
const waiting = status.textContent;
const loaded = document.createElement("small");
box.append(loaded);
let bytes = 0;
const meter = new PerformanceObserver((list) => {
  if (!box.isConnected) return meter.disconnect();
  for (const entry of list.getEntries()) bytes += entry.transferSize || entry.encodedBodySize || 0;
  loaded.textContent = `${Math.round(bytes / 1e6)} MB loaded`;
});
meter.observe({ type: "resource", buffered: true });
const start = () => import("%(entry)s").catch((error) => {
  status.textContent = "Unable to start. Open this page in a current desktop Chrome or Edge. " + error.message;
  console.error(error);
});
/* Phones get a choice before the download: the game needs a keyboard and mouse, or a gamepad. */
if (matchMedia("(pointer: coarse)").matches && !matchMedia("(any-pointer: fine)").matches) {
  status.textContent = "This game needs a keyboard and mouse, or a gamepad. It downloads up to %(total)d MB.";
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Load anyway";
  button.addEventListener("click", () => {
    button.remove();
    status.textContent = waiting;
    start();
  });
  box.append(button);
} else start();
</script>"""

EXTRA_STYLE = (
    "#loading{padding:24px}#loading button{justify-self:center;margin-top:20px;padding:10px 18px;border:0;cursor:pointer;"
    "background:#c9bea0;color:#171810;font:13px Georgia;letter-spacing:.08em}"
)


def read_packed(source):
    if source.lower().endswith(".zip"):
        with zipfile.ZipFile(source) as archive:
            pages = [name for name in archive.namelist() if name.lower().endswith(".html")]
            if len(pages) != 1:
                sys.exit("expected one .html in %s, found %s" % (source, pages))
            return pages[0], archive.read(pages[0]).decode("utf-8")
    with open(source, encoding="utf-8") as handle:
        return os.path.basename(source), handle.read()


def main(source, out):
    page_name, html = read_packed(source)
    root = os.path.realpath(out)
    os.makedirs(root, exist_ok=True)
    written = set()
    total = 0
    for match in PACKED.finditer(html):
        name, size = match.group(1), int(match.group(2))
        path = os.path.realpath(os.path.join(root, name))
        if not path.startswith(root + os.sep) or name == "index.html":
            sys.exit("refusing to write %r" % name)
        data = gzip.decompress(base64.b64decode("".join(match.group(3).split())))
        if len(data) != size:
            sys.exit("%s decoded to %d bytes, the build says %d" % (name, len(data), size))
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as handle:
            handle.write(data)
        written.add(os.path.relpath(path, root).replace(os.sep, "/"))
        total += size
    if not written:
        sys.exit("no packed game files found in %s" % page_name)

    shell = PACKED.sub("", html)
    bootstraps = BOOTSTRAP.findall(shell)
    host = re.search(r"hostname==='([^']+)'", bootstraps[0]) if len(bootstraps) == 1 else None
    entry = re.search(r"import '([^']+)'", bootstraps[0]) if len(bootstraps) == 1 else None
    if not (host and entry and "imports['game/'+n]" in bootstraps[0]):
        sys.exit("the bootstrap in %s changed; update the loader in games/unpack.py" % page_name)
    loader = LOADER % {"host": host.group(1), "entry": entry.group(1), "total": round(total / 1e6)}
    shell = shell.replace(bootstraps[0], loader)
    shell = shell.replace("</style>", EXTRA_STYLE + "</style>", 1)
    shell = shell.replace(
        "</head>",
        '<script type="importmap">{"imports":{"game/":"./"}}</script></head>',
        1,
    )
    origin = os.path.basename(source)
    if origin != page_name:
        origin = "%s (%s)" % (origin, page_name)
    shell = shell.replace("<head>", "<head><!-- Unpacked from %s by games/unpack.py -->" % origin, 1)
    with open(os.path.join(root, "index.html"), "w", encoding="utf-8", newline="\n") as handle:
        handle.write(shell)

    stale = []
    for folder, _, files in os.walk(root):
        for file in files:
            rel = os.path.relpath(os.path.join(folder, file), root).replace(os.sep, "/")
            if rel != "index.html" and rel not in written:
                stale.append(rel)
    print("%d files, %.1f MB, from %s into %s" % (len(written), total / 1e6, page_name, out))
    for rel in sorted(stale):
        print("not in this build:", rel)
    # GitHub refuses any file over 100 MB, so such a file has to be re-encoded or left out before a push.
    for rel in sorted(written):
        size = os.path.getsize(os.path.join(root, rel))
        if size > 100 * 1024 * 1024:
            print("over GitHub's 100 MB limit (%.0f MB): %s" % (size / 1048576, rel))


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
