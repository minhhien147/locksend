/** Lưu file lớn trực tiếp ra đĩa qua File System Access API (Chrome/Edge). */

type SaveFilePickerWindow = Window & {
  showSaveFilePicker?: (options: { suggestedName: string }) => Promise<{
    createWritable: () => Promise<FileSystemWritableFileStream>;
  }>;
};

export function supportsStreamingFileSave(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof (window as SaveFilePickerWindow).showSaveFilePicker === "function"
  );
}

export async function pickSaveFile(
  suggestedName: string
): Promise<FileSystemWritableFileStream> {
  const picker = (window as SaveFilePickerWindow).showSaveFilePicker;
  if (!picker) {
    throw new Error(
      "Trình duyệt không hỗ trợ lưu file lớn trực tiếp. Dùng Chrome hoặc Edge."
    );
  }
  const handle = await picker({ suggestedName });
  return handle.createWritable();
}

export async function writeChunk(
  writable: FileSystemWritableFileStream,
  data: Uint8Array
): Promise<void> {
  await writable.write(new Uint8Array(data));
}

export async function closeSaveFile(
  writable: FileSystemWritableFileStream
): Promise<void> {
  await writable.close();
}
