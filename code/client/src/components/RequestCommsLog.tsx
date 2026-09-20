import { useState, useEffect, useCallback, FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { subscribeToRequest, onReconnect } from '../services/socket';

export interface CommsMessage {
  _id: string;
  request: string;
  senderRole: 'claimant' | 'requester' | 'admin';
  senderName: string;
  senderPhone?: string;
  body: string;
  createdAt: string;
}

interface RequestCommsLogProps {
  requestId: string;
  requestStatus: string;
  defaultContactPhone?: string;
  requestCreatedById?: string;
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function getRoleLabel(role: CommsMessage['senderRole']) {
  switch (role) {
    case 'claimant':
      return { label: 'RESPONDER', border: 'border-l-teal', text: 'text-teal' };
    case 'requester':
      return { label: 'REQUESTER', border: 'border-l-ink', text: 'text-ink' };
    case 'admin':
      return { label: 'DISPATCH', border: 'border-l-rust', text: 'text-rust' };
    default:
      return { label: 'MEMBER', border: 'border-l-slate', text: 'text-slate' };
  }
}

export default function RequestCommsLog({
  requestId,
  requestStatus,
  defaultContactPhone = '',
  requestCreatedById,
}: RequestCommsLogProps) {
  const { user, token } = useAuth();
  const [messages, setMessages] = useState<CommsMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Message posting state
  const [bodyText, setBodyText] = useState('');
  const [phoneInput, setPhoneInput] = useState(defaultContactPhone);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (defaultContactPhone && !phoneInput) {
      setPhoneInput(defaultContactPhone);
    }
  }, [defaultContactPhone]);

  // Triage vs Post-Claim Access Control
  const isTriage = requestStatus === 'unverified' || requestStatus === 'verified';
  const isAdmin = user?.role === 'admin';
  const isResponderOrOther = user && ['volunteer', 'ngo', 'resource_provider'].includes(user.role);
  const isRequester =
    (user && (user.role === 'affected_person' || (requestCreatedById && user.id === requestCreatedById))) ||
    (!user && Boolean(phoneInput || defaultContactPhone)) ||
    (!isResponderOrOther && Boolean(phoneInput || defaultContactPhone));

  const canAccess = isTriage ? (isAdmin || isRequester) : true;

  const fetchMessages = useCallback(async () => {
    if (!requestId || !canAccess) return;
    setIsLoading(true);
    setFetchError(null);

    try {
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const phoneParam = phoneInput || defaultContactPhone;
      const url = phoneParam
        ? `/api/requests/${encodeURIComponent(requestId)}/messages?phone=${encodeURIComponent(phoneParam)}`
        : `/api/requests/${encodeURIComponent(requestId)}/messages`;

      const res = await fetch(url, { headers });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to retrieve communications thread.');
      }

      setMessages(data.messages || []);
    } catch (err: unknown) {
      setFetchError(err instanceof Error ? err.message : 'Error fetching message thread.');
    } finally {
      setIsLoading(false);
    }
  }, [requestId, canAccess, token, phoneInput, defaultContactPhone]);

  useEffect(() => {
    if (!canAccess || !requestId) return;

    fetchMessages();

    // 1. Subscribe to real-time message stream on authorized request channel
    const phone = phoneInput || defaultContactPhone;
    const subMessage = subscribeToRequest<{ message: CommsMessage }>(
      requestId,
      'message:new',
      (payload) => {
        if (!payload?.message) return;
        const newMsg = payload.message;
        setMessages((prev) => {
          const exists = prev.some((m) => m._id === newMsg._id);
          if (exists) return prev;
          return [...prev, newMsg];
        });
      },
      phone ? { phone } : undefined
    );

    // 2. Resync thread via REST if connection drops and reconnects
    const subReconnect = onReconnect(() => {
      fetchMessages();
    });

    // Safety background refresh interval (30s)
    const timer = setInterval(fetchMessages, 30000);

    return () => {
      subMessage.unsubscribe();
      subReconnect.unsubscribe();
      clearInterval(timer);
    };
  }, [fetchMessages, canAccess, requestId, phoneInput, defaultContactPhone]);

  const handleSendMessage = async (e: FormEvent) => {
    e.preventDefault();
    if (!bodyText.trim()) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const payload: Record<string, string> = {
        body: bodyText.trim(),
      };
      if (phoneInput.trim()) {
        payload.contactPhone = phoneInput.trim();
      }

      const res = await fetch(`/api/requests/${encodeURIComponent(requestId)}/messages`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to post message.');
      }

      setBodyText('');
      await fetchMessages();
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to send message.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="border border-slate-line bg-paper-raised">
      {/* Comms Log Header matching DESIGN_SYSTEM.md §06 */}
      <div className="p-3 bg-paper border-b border-slate-line flex items-center justify-between">
        <div className="flex items-center gap-2 font-mono text-xs text-ink font-semibold uppercase tracking-wider">
          <span>{isTriage ? 'Triage Communications' : 'Communications Log'}</span>
          {canAccess && (
            <span className="bg-paper-raised border border-slate-line px-1.5 py-0.5 text-slate font-normal">
              [{messages.length < 10 ? `0${messages.length}` : messages.length}]
            </span>
          )}
          {isTriage && canAccess && (
            <span className="bg-pine/10 border border-pine text-pine text-[10px] font-mono px-1.5 py-0.5 uppercase font-normal">
              Triage Channel Active
            </span>
          )}
        </div>

        {canAccess && (
          <button
            type="button"
            onClick={fetchMessages}
            disabled={isLoading}
            className="font-mono text-[11px] text-slate hover:text-ink cursor-pointer uppercase tracking-wider disabled:opacity-50"
          >
            {isLoading ? 'Syncing...' : 'Refresh'}
          </button>
        )}
      </div>

      {/* When access is not permitted or awaiting claim */}
      {!canAccess ? (
        <div className="p-6 text-center font-mono text-xs text-slate">
          {isTriage
            ? 'Direct dispatch inquiries are restricted to central dispatch and the requester during triage. Responders may participate once this request is claimed.'
            : 'Communications log opens once this request is claimed by an active response unit.'}
        </div>
      ) : (
        <>
          {/* Thread retrieval error banner */}
          {fetchError && (
            <div className="p-3 bg-paper-raised border-b border-slate-line border-l-[3px] border-l-rust font-mono text-xs text-rust">
              THREAD ERROR: {fetchError}
            </div>
          )}

          {/* Message Entries List */}
          {messages.length === 0 ? (
            <div className="p-8 text-center font-mono text-xs text-slate">
              {isTriage
                ? (isAdmin
                    ? 'No triage messages yet. Transmit clarifying questions or landmark inquiries below.'
                    : 'No messages from dispatch yet. You may provide landmarks or details below.')
                : 'No messages on this request yet.'}
            </div>
          ) : (
            <div className="divide-y divide-slate-line max-h-96 overflow-y-auto">
              {messages.map((msg) => {
                const badge = getRoleLabel(msg.senderRole);
                return (
                  <div
                    key={msg._id}
                    className={`p-3.5 border-l-[3px] ${badge.border} hover:bg-[#F9FAF9] transition-colors`}
                  >
                    {/* Meta row: Role tag, sender name, timestamp */}
                    <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] mb-1">
                      <div className="flex items-center gap-2">
                        <span className={`font-semibold uppercase ${badge.text}`}>
                          [{badge.label}]
                        </span>
                        <span className="font-sans font-semibold text-ink text-xs">
                          {msg.senderName}
                        </span>
                      </div>
                      <span className="text-slate text-[11px]">
                        {formatRelativeTime(msg.createdAt)}
                      </span>
                    </div>

                    {/* Left-aligned Message Body (Public Sans, no bubbles) */}
                    <p className="font-sans text-xs text-ink leading-relaxed whitespace-pre-wrap pl-0">
                      {msg.body}
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          {/* New Message Composition Area */}
          <div className="p-3.5 bg-paper border-t border-slate-line">
            {submitError && (
              <div className="mb-2 p-2 bg-paper-raised border border-slate-line border-l-[3px] border-l-rust font-mono text-xs text-rust">
                TRANSMISSION ERROR: {submitError}
              </div>
            )}

            <form onSubmit={handleSendMessage} className="space-y-2">
              {/* If user is anonymous / not authenticated, prompt for contact phone if needed */}
              {!token && !defaultContactPhone && (
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] text-slate uppercase">
                    Contact Phone:
                  </span>
                  <input
                    type="tel"
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    placeholder="Phone number registered with request"
                    className="flex-1 bg-white border border-slate-line px-2.5 py-1 text-xs text-ink font-sans outline-none rounded-[2px]"
                  />
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-2">
                <textarea
                  rows={2}
                  value={bodyText}
                  onChange={(e) => setBodyText(e.target.value)}
                  placeholder={
                    isTriage
                      ? (isAdmin
                          ? 'Ask citizen for landmarks, clarifying details, or situational update...'
                          : 'Provide landmarks, directions, or clarify emergency requirements...')
                      : (user
                          ? `Transmit message as ${user.name} (${user.role})...`
                          : 'Type operational update or response...')
                  }
                  className="flex-1 bg-white border border-slate-line focus:border-ink px-3 py-2 text-xs text-ink font-sans outline-none rounded-[2px] resize-none"
                />

                <button
                  type="submit"
                  disabled={isSubmitting || !bodyText.trim()}
                  className="bg-ink text-white font-sans text-xs font-semibold px-4 py-2 rounded-[3px] hover:bg-ink-soft cursor-pointer disabled:opacity-50 shrink-0 self-end sm:self-stretch flex items-center justify-center"
                >
                  {isSubmitting
                    ? 'Transmitting...'
                    : isTriage
                    ? 'Send triage inquiry'
                    : 'Transmit message'}
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
