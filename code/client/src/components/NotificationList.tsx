import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { subscribeToNotification, onReconnect } from '../services/socket';

export interface NotificationItem {
  _id: string;
  type: 'request_verified' | 'request_claimed' | 'request_resolved' | 'new_message' | 'system_alert';
  title: string;
  message: string;
  isRead: boolean;
  readAt?: string;
  request?: {
    _id: string;
    requestId: string;
    category?: string;
    status?: string;
  };
  createdAt: string;
}

interface NotificationListProps {
  onUnreadCountChange?: (count: number) => void;
  onSelectRequest?: (requestId: string) => void;
}

function formatRelativeTime(dateString: string): string {
  const diffMs = Date.now() - new Date(dateString).getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function getTypeBadge(type: NotificationItem['type']) {
  switch (type) {
    case 'request_verified':
      return { label: 'VERIFIED', border: 'border-l-teal', text: 'text-teal' };
    case 'request_claimed':
      return { label: 'CLAIMED', border: 'border-l-ink', text: 'text-ink' };
    case 'request_resolved':
      return { label: 'RESOLVED', border: 'border-l-teal', text: 'text-teal' };
    case 'new_message':
      return { label: 'MESSAGE', border: 'border-l-amber', text: 'text-amber' };
    case 'system_alert':
      return { label: 'ALERT', border: 'border-l-rust', text: 'text-rust' };
    default:
      return { label: 'LOG', border: 'border-l-slate', text: 'text-slate' };
  }
}

export default function NotificationList({ onUnreadCountChange, onSelectRequest }: NotificationListProps) {
  const { token } = useAuth();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [filterUnreadOnly, setFilterUnreadOnly] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchNotifications = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setActionError(null);
    try {
      const url = filterUnreadOnly
        ? '/api/notifications?unreadOnly=true'
        : '/api/notifications';
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch notifications');
      }
      setNotifications(data.notifications || []);
      const count = typeof data.unreadCount === 'number' ? data.unreadCount : 0;
      setUnreadCount(count);
      if (onUnreadCountChange) {
        onUnreadCountChange(count);
      }
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Error fetching notifications');
    } finally {
      setIsLoading(false);
    }
  }, [token, filterUnreadOnly, onUnreadCountChange]);

  useEffect(() => {
    fetchNotifications();

    // 1. Listen for real-time notifications pushed to the user's private channel
    const subNotif = subscribeToNotification<{ notification: NotificationItem }>((payload) => {
      if (!payload?.notification) return;
      const newNotif = payload.notification;
      setNotifications((prev) => {
        const exists = prev.some((n) => n._id === newNotif._id);
        if (exists) return prev;
        return [newNotif, ...prev];
      });

      if (!newNotif.isRead) {
        setUnreadCount((prev) => {
          const next = prev + 1;
          if (onUnreadCountChange) onUnreadCountChange(next);
          return next;
        });
      }
    });

    // 2. Resync via REST if socket reconnects after connection drop
    const subReconnect = onReconnect(() => {
      fetchNotifications();
    });

    // Background safety interval (every 30s)
    const interval = setInterval(fetchNotifications, 30000);

    return () => {
      subNotif.unsubscribe();
      subReconnect.unsubscribe();
      clearInterval(interval);
    };
  }, [fetchNotifications, onUnreadCountChange]);

  const handleMarkAsRead = async (id: string) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/notifications/${id}/read`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to mark notification as read');
      }
      setNotifications((prev) =>
        prev.map((n) => (n._id === id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n))
      );
      setUnreadCount((prev) => {
        const next = Math.max(0, prev - 1);
        if (onUnreadCountChange) onUnreadCountChange(next);
        return next;
      });
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Error updating notification');
    }
  };

  const handleMarkAllAsRead = async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/notifications/read-all', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to mark all notifications as read');
      }
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, isRead: true, readAt: new Date().toISOString() }))
      );
      setUnreadCount(0);
      if (onUnreadCountChange) onUnreadCountChange(0);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Error updating notifications');
    }
  };

  const displayedNotifications = filterUnreadOnly
    ? notifications.filter((n) => !n.isRead)
    : notifications;

  return (
    <div className="border border-slate-line bg-paper-raised">
      {/* Ledger Header */}
      <div className="p-3 bg-paper border-b border-slate-line flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="font-mono text-xs font-semibold text-ink uppercase tracking-wider">
            Notifications Ledger
          </div>
          <span className="font-mono text-xs bg-paper-raised border border-slate-line px-1.5 py-0.5 text-ink font-semibold">
            [{unreadCount < 10 ? `0${unreadCount}` : unreadCount} UNREAD]
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Unread Filter Toggle */}
          <button
            type="button"
            onClick={() => setFilterUnreadOnly((prev) => !prev)}
            className={`font-mono text-[11px] px-2 py-1 border transition-colors cursor-pointer uppercase ${
              filterUnreadOnly
                ? 'bg-ink text-white border-ink font-semibold'
                : 'bg-paper-raised text-slate border-slate-line hover:border-ink'
            }`}
          >
            {filterUnreadOnly ? 'Showing unread' : 'Filter unread'}
          </button>

          {/* Mark All Read Button */}
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllAsRead}
              className="font-mono text-[11px] px-2.5 py-1 bg-paper-raised text-ink border border-slate-line hover:border-ink cursor-pointer uppercase"
            >
              Mark all read
            </button>
          )}

          {/* Manual Refresh */}
          <button
            type="button"
            onClick={fetchNotifications}
            disabled={isLoading}
            className="font-mono text-[11px] text-slate hover:text-ink cursor-pointer uppercase tracking-wider px-2 py-1 disabled:opacity-50"
          >
            {isLoading ? 'Syncing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Action error banner */}
      {actionError && (
        <div className="p-2.5 bg-paper-raised border-b border-slate-line border-l-[3px] border-l-rust font-mono text-xs text-rust">
          NOTIFICATION ERROR: {actionError}
        </div>
      )}

      {/* Notification List Rows */}
      {displayedNotifications.length === 0 ? (
        <div className="p-10 text-center font-mono text-xs text-slate">
          No notifications logged yet.
        </div>
      ) : (
        <div className="divide-y divide-slate-line">
          {displayedNotifications.map((notif) => {
            const badge = getTypeBadge(notif.type);
            return (
              <div
                key={notif._id}
                className={`p-3.5 transition-colors hover:bg-[#F9FAF9] border-l-[3px] ${badge.border} ${
                  notif.isRead ? 'bg-paper-raised opacity-85' : 'bg-white font-medium'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                  <div className="space-y-1 flex-1">
                    {/* Meta line: Type badge + Request ID + Timestamp */}
                    <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
                      <span className={`font-semibold uppercase ${badge.text}`}>
                        {badge.label}
                      </span>

                      {notif.request && notif.request.requestId && (
                        <button
                          type="button"
                          onClick={() => onSelectRequest && onSelectRequest(notif.request!.requestId)}
                          className="text-ink underline hover:text-ink-soft cursor-pointer font-semibold"
                        >
                          {notif.request.requestId}
                        </button>
                      )}

                      <span className="text-slate">
                        {formatRelativeTime(notif.createdAt)}
                      </span>

                      {!notif.isRead ? (
                        <span className="bg-paper border border-slate-line px-1 py-0.2 text-[10px] text-ink font-semibold">
                          UNREAD
                        </span>
                      ) : (
                        <span className="text-slate text-[10px]">
                          READ
                        </span>
                      )}
                    </div>

                    {/* Notification Title */}
                    <div className="font-sans text-xs sm:text-sm font-semibold text-ink">
                      {notif.title}
                    </div>

                    {/* Notification Message */}
                    <p className="font-sans text-xs text-slate leading-relaxed">
                      {notif.message}
                    </p>
                  </div>

                  {/* Contextual Action: Mark as read */}
                  {!notif.isRead && (
                    <div className="sm:self-center shrink-0">
                      <button
                        type="button"
                        onClick={() => handleMarkAsRead(notif._id)}
                        className="font-mono text-[11px] text-ink border border-slate-line px-2.5 py-1 bg-paper hover:bg-paper-raised hover:border-ink cursor-pointer rounded-[2px]"
                      >
                        Mark read
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
