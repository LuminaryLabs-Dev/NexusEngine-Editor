export function authoringErrorRecord(error) {
  return {
    code: error?.code ?? "AUTHORING_INTERNAL_ERROR",
    message: error?.message ?? String(error),
    details: error?.details ?? {},
  };
}
export async function routeAuthoringCommand(host, message) {
  const id = message?.id ?? null;
  try {
    if (
      !message ||
      typeof message !== "object" ||
      Array.isArray(message) ||
      typeof message.method !== "string" ||
      typeof id !== "string" ||
      !id
    )
      throw Object.assign(
        new Error("Messages require a string id and method."),
        { code: "AUTHORING_TRANSPORT_INPUT" },
      );
    const p = message.params ?? {};
    let result;
    switch (message.method) {
      case "status":
        result = host.status();
        break;
      case "tools":
        result = host.tools();
        break;
      case "list":
        result = host.list(p.kind);
        break;
      case "read":
        result = host.read(p.id);
        break;
      case "execute":
        result = await host.command(p);
        break;
      case "undo":
        result = await host.undo(p);
        break;
      case "redo":
        result = await host.redo(p);
        break;
      case "preview":
        result = host.preview(p);
        break;
      case "accept":
        result = await host.accept(p);
        break;
      case "save":
        result = await host.save();
        break;
      case "prepare":
        result = host.prepare(p);
        break;
      case "close":
        result = await host.close(p);
        break;
      default:
        throw Object.assign(
          new Error(`Unknown Authoring method ${message.method}.`),
          { code: "AUTHORING_TRANSPORT_METHOD" },
        );
    }
    return { id, ok: true, result };
  } catch (error) {
    return { id, ok: false, error: authoringErrorRecord(error) };
  }
}
