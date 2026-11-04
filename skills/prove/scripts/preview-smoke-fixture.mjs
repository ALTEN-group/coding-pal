import { createServer } from "node:http";

/** Starts a local preview app. `hits` counts requests per path. */
export async function startPreview({ flakyFailures = 2 } = {}) {
	const hits = {};
	const server = createServer((req, res) => {
		hits[req.url] = (hits[req.url] ?? 0) + 1;
		const json = (status, body) => {
			res.writeHead(status, { "content-type": "application/json" });
			res.end(JSON.stringify(body));
		};
		if (req.url === "/health") return json(200, { status: "ok", version: { major: 2 } });
		if (req.url === "/items") return json(200, { items: [{ id: 7 }, { id: 8 }] });
		if (req.url === "/flaky") return hits[req.url] <= flakyFailures ? json(503, { status: "starting" }) : json(200, { status: "ok" });
		if (req.url === "/always-down") return json(500, { status: "down" });
		if (req.url === "/teapot") return json(503, { status: "maintenance" });
		if (req.url === "/not-json") {
			res.writeHead(200, { "content-type": "text/plain" });
			return res.end("hello");
		}
		if (req.url === "/redirect") {
			res.writeHead(302, { location: "/health" });
			return res.end();
		}
		if (req.url === "/slow") return setTimeout(() => json(200, { status: "ok" }), 150);
		if (req.url === "/hang") return undefined;
		return json(404, { error: "not found" });
	});
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	return {
		url: `http://127.0.0.1:${server.address().port}`,
		hits,
		close: () => new Promise((resolve) => {
			server.closeAllConnections();
			server.close(resolve);
		}),
	};
}

/** Returns a URL on which nothing is listening. */
export async function closedUrl() {
	const preview = await startPreview();
	const { url } = preview;
	await preview.close();
	return url;
}
