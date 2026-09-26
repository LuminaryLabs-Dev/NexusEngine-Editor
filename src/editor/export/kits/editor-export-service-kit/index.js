import { defineDomainServiceKit } from "nexusengine/domain-service-kit";
import { normalizeEditorExportProvider, requireSupportedInspection } from "../../contracts/provider.js";
import { normalizeEditorExportRequest } from "../../contracts/request.js";
import { publishEditorExportArtifact } from "../../publishing/artifact-output.js";

const fail = (code, message, details = {}) =>
  Object.assign(new Error(message), { code, details });

export function createEditorExportServiceKit({ providers = [] } = {}) {
  const initialProviders = providers.map(normalizeEditorExportProvider);
  return defineDomainServiceKit({
    id: "editor-export-service-kit",
    domain: "editor-export",
    domainPath: "n:editor:export",
    parentDomainPath: "n:editor",
    apiName: "editorExport",
    version: "0.1.0",
    stability: "stable-candidate",
    requires: ["n:authoring:publishing"],
    provides: ["n:editor:export", "export:asset"],
    metadata: {
      purpose:
        "Own provider-neutral Authoring packet export, validation, publication, and receipts.",
      providerNeutral: true,
    },
    createApi() {
      const registry = new Map();
      const registerProvider = (input) => {
        const provider = normalizeEditorExportProvider(input),
          existing = registry.get(provider.format);
        if (existing && existing.id !== provider.id)
          throw fail(
            "EDITOR_EXPORT_PROVIDER_COLLISION",
            `Format ${provider.format} is already owned by ${existing.id}.`,
          );
        registry.set(provider.format, provider);
        return descriptor(provider);
      };
      for (const provider of initialProviders) registerProvider(provider);
      const providerFor = (format) => {
        const normalized = String(format ?? "").trim().toLowerCase(),
          provider = registry.get(normalized);
        if (!provider)
          throw fail(
            "EDITOR_EXPORT_FORMAT_UNAVAILABLE",
            `No export provider is installed for ${normalized || "the requested format"}.`,
            { format: normalized, available: [...registry.keys()].sort() },
          );
        return provider;
      };
      return {
        registerProvider,
        formats() {
          return [...registry.values()]
            .map(descriptor)
            .sort((a, b) => a.format.localeCompare(b.format));
        },
        inspect({ packet, format }) {
          const provider = providerFor(format);
          return {
            provider: descriptor(provider),
            ...provider.inspect(packet),
          };
        },
        async encode({ packet, format }, options = {}) {
          const provider = providerFor(format),
            result = provider.inspect(packet);
          requireSupportedInspection(result, provider);
          return provider.encode(packet, options);
        },
        async validate({ bytes, format, encoded = null }) {
          const provider = providerFor(format);
          return provider.validate(bytes, { encoded });
        },
        async export(input, options = {}) {
          const request = normalizeEditorExportRequest(input),
            provider = providerFor(request.format),
            checked = provider.inspect(request.packet);
          requireSupportedInspection(checked, provider);
          options.onProgress?.({
            stage: "encode",
            progress: 0,
            format: provider.format,
          });
          const encoded = await provider.encode(request.packet, {
            ...options,
            inspection: checked,
          });
          if (options.signal?.aborted)
            throw fail("EDITOR_EXPORT_CANCELLED", "Export cancelled.");
          options.onProgress?.({
            stage: "validate",
            progress: 0.5,
            format: provider.format,
          });
          const validation = await provider.validate(encoded.bytes, { encoded });
          if (validation.errors)
            throw fail(
              "EDITOR_EXPORT_INVALID",
              `${provider.format.toUpperCase()} validation failed.`,
              { validation },
            );
          return publishEditorExportArtifact(
            provider,
            encoded,
            validation,
            request.outputDirectory,
            options,
          );
        },
        publish(input, options = {}) {
          return this.export(input, options);
        },
      };
    },
  });
}

function descriptor(provider) {
  return Object.freeze({
    id: provider.id,
    format: provider.format,
    extension: provider.extension,
    mimeType: provider.mimeType,
    profile: provider.profile,
    capabilities: provider.capabilities,
  });
}
