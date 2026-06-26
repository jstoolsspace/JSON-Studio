import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { getNodeValue } from "../ipc/commands";

/// Modal that decodes a string node into an image and renders it. The node may
/// already be a full data: URI, or a bare base64 payload whose format we sniff.
export function ImagePreview({
  docId,
  nodeId,
  label,
  onClose,
}: {
  docId: number;
  nodeId: number;
  label: string;
  onClose: () => void;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const raw = await getNodeValue(docId, nodeId);
        // Raw is the lossless JSON token, including surrounding quotes.
        const text = JSON.parse(raw) as unknown;
        if (typeof text !== "string") {
          throw new Error("node is not a string");
        }
        const uri = toDataUri(text);
        if (!uri) throw new Error("not a recognizable image");
        if (alive) setSrc(uri);
      } catch (e) {
        if (alive) setError(String(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, [docId, nodeId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="image-modal" onClick={onClose}>
      <div className="image-stage" onClick={(e) => e.stopPropagation()}>
        <div className="image-head">
          <span className="image-label" title={label}>
            {label}
          </span>
          <button className="btn icon" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        {error ? (
          <div className="image-error">{error}</div>
        ) : src ? (
          <img className="image-img" src={src} alt={label} />
        ) : (
          <div className="image-error">Loading…</div>
        )}
      </div>
    </div>
  );
}

/// True if a string value looks like an embeddable image (data URI or base64).
export function isImageValue(preview: string): boolean {
  const s = preview.replace(/^"|"$/g, "");
  if (s.startsWith("data:image/")) return true;
  return sniffBase64Image(s) !== null;
}

function toDataUri(text: string): string | null {
  if (text.startsWith("data:image/")) return text;
  const mime = sniffBase64Image(text);
  if (!mime) return null;
  return `data:${mime};base64,${text}`;
}

/// Guess an image MIME type from the leading bytes of a base64 payload.
function sniffBase64Image(s: string): string | null {
  const head = s.slice(0, 16);
  if (head.startsWith("iVBORw0KGgo")) return "image/png";
  if (head.startsWith("/9j/")) return "image/jpeg";
  if (head.startsWith("R0lGOD")) return "image/gif";
  if (head.startsWith("UklGR")) return "image/webp";
  if (head.startsWith("PHN2Zy") || head.startsWith("PD94bWw")) {
    return "image/svg+xml";
  }
  return null;
}
