import {
  routeAuthoringCommand,
  authoringErrorRecord,
} from "../command-router.js";
export async function serveAuthoringStdio(
  host,
  {
    input = process.stdin,
    output = process.stdout,
    maxLineBytes = 32 * 1024 * 1024,
  } = {},
) {
  let pending = Buffer.alloc(0);
  const write = async (value) => {
    if (!output.write(JSON.stringify(value) + "\n"))
      await new Promise((resolve) => output.once("drain", resolve));
  };
  for await (const chunk of input) {
    pending = Buffer.concat([pending, Buffer.from(chunk)]);
    let index;
    while ((index = pending.indexOf(10)) >= 0) {
      if (index > maxLineBytes)
        throw Object.assign(new Error("Stdio frame exceeds the size limit."), {
          code: "AUTHORING_TRANSPORT_BUDGET",
        });
      const line = pending.subarray(0, index).toString("utf8");
      pending = pending.subarray(index + 1);
      if (!line.trim()) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch (error) {
        await write({
          id: null,
          ok: false,
          error: {
            code: "AUTHORING_TRANSPORT_JSON",
            message: "Invalid JSON frame.",
            details: {},
          },
        });
        continue;
      }
      await write(await routeAuthoringCommand(host, message));
      if (host.status().state === "closed") return;
    }
    if (pending.length > maxLineBytes)
      throw Object.assign(new Error("Stdio frame exceeds the size limit."), {
        code: "AUTHORING_TRANSPORT_BUDGET",
      });
  }
  if (pending.toString("utf8").trim())
    await write({
      id: null,
      ok: false,
      error: {
        code: "AUTHORING_TRANSPORT_TRUNCATED",
        message: "Input ended before the final newline.",
        details: {},
      },
    });
}
