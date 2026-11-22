import { UserPlus, Check, X } from "lucide-react";
import "./PendingRequests.css";

import { useLanguage } from "../../context/LanguageContext";
import { useRequestDecisions } from "../../controller/JoinController";
import type { Group } from "../../model/Group";
import { formatRequestedAt, type JoinRequest } from "../../model/JoinRequest";

interface PendingRequestsProps {
    group: Group;
    requests: JoinRequest[];
}

/**
 * Owner-only list of people waiting to join, with Accept / Decline. [G6, G7,
 * Manage polish]
 *
 * ── State-dependent size ─────────────────────────────────────────────────
 * Zero pending is the state this section spends most of its life in, so
 * the whole card collapses to a single slim status line — same pattern as
 * WhatsDue's all-clear and GroupSpend's RM 0 lines on the group page.
 * Once at least one request lands, the full card returns with its header,
 * the teal count badge, and the row-per-request list with Accept/Decline.
 */
const PendingRequests = ({ group, requests }: PendingRequestsProps) => {
    const { locale } = useLanguage();
    const { accept, decline, busyRequestId } = useRequestDecisions();

    // Empty: slim status line, not a card. `role="status"` marks the line
    // as the section's live-region equivalent — a reader who used to see
    // the "Requests to join" heading here still gets the section
    // announced when a request arrives.
    if (requests.length === 0) {
        return (
            <p className="pending-clear" role="status">
                {locale.join.pendingEmpty}
            </p>
        );
    }

    return (
        <section className="pending-panel">
            <div className="pending-header">
                <UserPlus size={16} strokeWidth={2.5} />
                <h2 className="pending-title">{locale.join.pendingTitle}</h2>
                <span className="pending-count">{requests.length}</span>
            </div>

            <ul className="pending-list">
                {requests.map((request) => {
                    const isBusy = busyRequestId === request.id;

                    return (
                        <li key={request.id} className="pending-item">
                            <div className="pending-item-body">
                                <span className="pending-name">
                                    {request.username}
                                </span>
                                <span className="pending-when">
                                    {formatRequestedAt(request)}
                                </span>
                            </div>

                            <div className="pending-actions">
                                <button
                                    type="button"
                                    className="pending-btn pending-accept"
                                    onClick={() => accept(group, request)}
                                    disabled={isBusy}
                                    aria-label={`${locale.join.accept} ${request.username}`}
                                >
                                    <Check size={15} strokeWidth={2.5} />
                                    <span>{locale.join.accept}</span>
                                </button>
                                <button
                                    type="button"
                                    className="pending-btn pending-decline"
                                    onClick={() => decline(group, request)}
                                    disabled={isBusy}
                                    aria-label={`${locale.join.decline} ${request.username}`}
                                >
                                    <X size={15} strokeWidth={2.5} />
                                    <span>{locale.join.decline}</span>
                                </button>
                            </div>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
};

export default PendingRequests;
