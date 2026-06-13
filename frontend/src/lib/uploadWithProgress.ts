export type UploadProgressResult = {
  status: number;
  data: Record<string, unknown>;
  statusText: string;
};

/** POST multipart con barra di avanzamento (fetch non espone upload progress). */
export function uploadFormWithProgress(
  url: string,
  formData: FormData,
  headers: Record<string, string>,
  onProgress?: (percent: number) => void
): Promise<UploadProgressResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() === "content-type") continue;
      xhr.setRequestHeader(key, value);
    }
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.min(100, Math.round((e.loaded / e.total) * 100)));
      }
    });
    xhr.addEventListener("load", () => {
      let data: Record<string, unknown> = {};
      const text = xhr.responseText?.trim() ?? "";
      if (text) {
        try {
          data = JSON.parse(text) as Record<string, unknown>;
        } catch {
          data = { error: text || xhr.statusText };
        }
      }
      resolve({ status: xhr.status, data, statusText: xhr.statusText });
    });
    xhr.addEventListener("error", () => reject(new Error("Errore di rete durante l'upload")));
    xhr.addEventListener("abort", () => reject(new Error("Upload annullato")));
    xhr.send(formData);
  });
}
