import { useState, useEffect, useCallback, FormEvent, ChangeEvent } from 'react';
import { useAuth } from '../context/AuthContext';

export interface EvidenceItem {
  _id: string;
  fileName: string;
  fileType: string;
  fileUrl: string;
  fileSize?: number;
  description?: string;
  uploaderName: string;
  uploader?: {
    _id: string;
    name: string;
    role: string;
  };
  uploadedAt: string;
}

interface EvidenceAttachmentListProps {
  requestId: string;
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function simplifyMimeType(mime: string): string {
  if (mime.includes('pdf')) return 'PDF';
  if (mime.includes('image/jpeg') || mime.includes('image/jpg')) return 'JPEG';
  if (mime.includes('image/png')) return 'PNG';
  if (mime.includes('image/webp')) return 'WEBP';
  if (mime.includes('image')) return 'IMAGE';
  if (mime.includes('word') || mime.includes('document')) return 'DOC';
  return 'FILE';
}

export default function EvidenceAttachmentList({ requestId }: EvidenceAttachmentListProps) {
  const { user, token } = useAuth();
  const [evidenceList, setEvidenceList] = useState<EvidenceItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Upload Form State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [descriptionInput, setDescriptionInput] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  const fetchEvidence = useCallback(async () => {
    if (!requestId) return;
    setIsLoading(true);
    setFetchError(null);

    try {
      const res = await fetch(`/api/requests/${encodeURIComponent(requestId)}/evidence`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to retrieve evidence attachments.');
      }

      setEvidenceList(data.evidence || []);
    } catch (err: unknown) {
      setFetchError(err instanceof Error ? err.message : 'Error fetching evidence.');
    } finally {
      setIsLoading(false);
    }
  }, [requestId]);

  useEffect(() => {
    fetchEvidence();
  }, [fetchEvidence]);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
      setUploadError(null);
      setUploadSuccess(null);
    }
  };

  const handleUploadSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setUploadError('Please select a file to attach.');
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    setUploadSuccess(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      if (descriptionInput.trim()) {
        formData.append('description', descriptionInput.trim());
      }
      if (!token && user?.name) {
        formData.append('uploaderName', user.name);
      }

      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(`/api/requests/${encodeURIComponent(requestId)}/evidence`, {
        method: 'POST',
        headers,
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to upload file.');
      }

      setUploadSuccess(`Attached "${selectedFile.name}" successfully.`);
      setSelectedFile(null);
      setDescriptionInput('');
      // Reset input element
      const fileInput = document.getElementById('evidence-file-input') as HTMLInputElement;
      if (fileInput) fileInput.value = '';

      await fetchEvidence();
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : 'Failed to attach evidence.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="border border-slate-line bg-paper-raised">
      {/* Header matching DESIGN_SYSTEM.md §06 */}
      <div className="p-3 bg-paper border-b border-slate-line flex items-center justify-between">
        <div className="flex items-center gap-2 font-mono text-xs text-ink font-semibold uppercase tracking-wider">
          <span>Supporting Evidence & Documents</span>
          <span className="bg-paper-raised border border-slate-line px-1.5 py-0.5 text-slate font-normal">
            [{evidenceList.length < 10 ? `0${evidenceList.length}` : evidenceList.length}]
          </span>
        </div>

        <button
          type="button"
          onClick={fetchEvidence}
          disabled={isLoading}
          className="font-mono text-[11px] text-slate hover:text-ink cursor-pointer uppercase tracking-wider disabled:opacity-50"
        >
          {isLoading ? 'Syncing...' : 'Refresh'}
        </button>
      </div>

      {/* Fetch error banner */}
      {fetchError && (
        <div className="p-3 bg-paper-raised border-b border-slate-line border-l-[3px] border-l-rust font-mono text-xs text-rust">
          EVIDENCE ERROR: {fetchError}
        </div>
      )}

      {/* Upload success notification */}
      {uploadSuccess && (
        <div className="p-3 bg-paper-raised border-b border-slate-line border-l-[3px] border-l-teal font-mono text-xs text-teal">
          {uploadSuccess}
        </div>
      )}

      {/* Upload error banner */}
      {uploadError && (
        <div className="p-3 bg-paper-raised border-b border-slate-line border-l-[3px] border-l-rust font-mono text-xs text-rust">
          ATTACHMENT ERROR: {uploadError}
        </div>
      )}

      {/* Evidence Rows List (Dense Row Pattern per DESIGN_SYSTEM.md §06, not a thumbnail grid) */}
      {evidenceList.length === 0 ? (
        <div className="p-8 text-center font-mono text-xs text-slate">
          No supporting evidence attached to this request yet.
        </div>
      ) : (
        <div className="divide-y divide-slate-line">
          {evidenceList.map((item) => (
            <div
              key={item._id}
              className="p-3.5 hover:bg-[#F9FAF9] transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="space-y-1">
                {/* Meta line: Type tag + Uploader + Timestamp + File size */}
                <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
                  <span className="bg-paper border border-slate-line px-1.5 py-0.5 font-semibold uppercase text-ink">
                    [{simplifyMimeType(item.fileType)}]
                  </span>

                  <span className="text-slate">
                    by <span className="text-ink font-sans font-semibold">{item.uploaderName}</span>
                    {item.uploader?.role && (
                      <span className="ml-1 uppercase text-[10px] text-slate font-mono">
                        ({item.uploader.role})
                      </span>
                    )}
                  </span>

                  <span className="text-slate">·</span>

                  <span className="text-slate">
                    {formatRelativeTime(item.uploadedAt)}
                  </span>

                  {item.fileSize ? (
                    <>
                      <span className="text-slate">·</span>
                      <span className="text-slate">{formatFileSize(item.fileSize)}</span>
                    </>
                  ) : null}
                </div>

                {/* File Name & Description */}
                <div className="font-mono text-xs text-ink font-semibold break-all">
                  {item.fileName}
                </div>

                {item.description && (
                  <p className="font-sans text-xs text-slate leading-relaxed">
                    {item.description}
                  </p>
                )}
              </div>

              {/* Action Button: Open / Download File */}
              <div className="shrink-0 self-start sm:self-center">
                <a
                  href={item.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block font-mono text-[11px] text-ink border border-slate-line px-3 py-1.5 bg-paper hover:bg-paper-raised hover:border-ink rounded-[2px] transition-colors"
                >
                  Open file
                </a>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload Attachment Bar */}
      <div className="p-3.5 bg-paper border-t border-slate-line">
        <form onSubmit={handleUploadSubmit} className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
            <div className="flex-1 w-full sm:w-auto">
              <input
                id="evidence-file-input"
                type="file"
                onChange={handleFileChange}
                accept="image/*,.pdf,.doc,.docx,.txt"
                className="w-full text-xs font-mono text-slate file:mr-3 file:py-1.5 file:px-3 file:rounded-[2px] file:border file:border-slate-line file:bg-white file:text-ink file:font-sans file:text-xs file:font-semibold hover:file:border-ink cursor-pointer"
              />
            </div>

            <button
              type="submit"
              disabled={isUploading || !selectedFile}
              className="bg-ink text-white font-sans text-xs font-semibold px-4 py-1.5 rounded-[3px] hover:bg-ink-soft cursor-pointer disabled:opacity-50 shrink-0 w-full sm:w-auto"
            >
              {isUploading ? 'Attaching...' : 'Attach evidence'}
            </button>
          </div>

          {selectedFile && (
            <div>
              <input
                type="text"
                value={descriptionInput}
                onChange={(e) => setDescriptionInput(e.target.value)}
                placeholder="Optional description / context (e.g. 'Damage assessment photo taken from North exit')"
                className="w-full bg-white border border-slate-line focus:border-ink px-2.5 py-1.5 text-xs text-ink font-sans outline-none rounded-[2px]"
                maxLength={500}
              />
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
