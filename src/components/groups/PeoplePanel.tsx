import { useState } from "react";
import { Link } from "react-router";
import { ChevronDown, Lock, UserPlus } from "lucide-react";
import "./PeoplePanel.css";

import ToggleSwitch from "../form/ToggleSwitch";
import { ConfirmDialog } from "../ui";
import { useLanguage } from "../../context/LanguageContext";
import { useToast } from "../../context/Toast";
import { useDebouncedToggle } from "../../utils/useDebouncedToggle";
import {
    carDisplayName,
    hasCarEdit,
    hasImplicitCarEdit,
    type Car,
} from "../../model/Car";
import {
    memberEntries,
    type Group,
    type MemberEntry,
} from "../../model/Group";

interface PeoplePanelProps {
    group: Group;
    cars: Car[];
    /** Owner-only interactive controls. Everyone sees the same roster. */
    canManage: boolean;
    /** Owner remove-member. */
    onRemove: (member: MemberEntry) => void;
    busyUid: string | null;
    /** Owner group-level "can add cars" toggle. [C1]
     *  Returns whether the settled write succeeded — the debounced switch
     *  needs the answer so it can revert the optimistic flip on failure. */
    onToggleCarAdder: (
        member: MemberEntry,
        allowed: boolean,
    ) => Promise<boolean>;
    /** Owner per-car edit toggle inside the panel. [C7]
     *  Returns write success for the same reason as `onToggleCarAdder`. */
    onTogglePerCar: (
        car: Car,
        uid: string,
        allowed: boolean,
    ) => Promise<boolean>;
    /**
     * Owner bulk edit toggle — flips every non-implicit per-car flag for this
     * member in one batch. See useCarAccessActions.setCarEditBulk. Returns
     * write success.
     */
    onBulkEdit: (
        member: MemberEntry,
        allowed: boolean,
    ) => Promise<boolean>;
    /** Uid of the member whose bulk write is currently committing. When set,
     *  every per-car cell for that member freezes so a per-car flip can't
     *  half-commit on top of the bulk batch. */
    bulkBusyUid: string | null;
    /** Href for the "Invite people" link in the single-member nudge. */
    invitePath?: string;
}

/**
 * People card as a ROSTER of expandable member panels.
 * [Members redesign, person-centric]
 *
 * ── What the collapsed roster is ─────────────────────────────────────────
 * One row per member: avatar + name + a live access summary chip
 * ("Owner" / "Can edit" / "View only" / "Custom") + chevron. The entire
 * row is the click target; only one panel is open at a time.
 *
 * ── The expanded panel body ──────────────────────────────────────────────
 * A subtly inset gray container sits beneath the row and holds every
 * permission control for that member as flush label-left / switch-right
 * rows. In the Members redesign the old nested per-car disclosure was
 * removed: the per-car list renders directly under a small uppercase
 * "Per-car edit access" section label. When "Can edit all cars" is ON,
 * the per-car switches show as on + disabled, so the reader can see the
 * effective state without letting them half-fight the bulk grant.
 *
 * The container is closed at the bottom by a hairline divider and a
 * right-aligned "Remove member" danger button — right-aligned rather than
 * a bare left-flow link so a destructive action doesn't sit in the
 * middle of the settings grid.
 *
 * ── Derived summary chip ─────────────────────────────────────────────────
 *   • owner                                     → "Owner"     (teal chip)
 *   • every non-implicit car edit flag TRUE     → "Can edit"  (teal)
 *   • every non-implicit car edit flag FALSE    → "View only" (muted)
 *   • some true, some false                     → "Custom"    (muted)
 *
 * An implicit-on-every-car member has an empty eligible set; the summary
 * reads "Can edit" because that's the effective outcome. Zero cars in the
 * group collapses to "Can edit" for the owner and "View only" for
 * everyone else — there is nothing to grant.
 *
 * ── Writes are UNCHANGED ─────────────────────────────────────────────────
 * Every toggle handler, the debounce hook, the bulk-mixed hint, the
 * ConfirmDialog Remove flow — same shapes the emulator rules suite pins
 * down. This redesign moves controls; it does not change what they write
 * or when.
 */
const PeoplePanel = ({
    group,
    cars,
    canManage,
    onRemove,
    busyUid,
    onToggleCarAdder,
    onTogglePerCar,
    onBulkEdit,
    bulkBusyUid,
    invitePath,
}: PeoplePanelProps) => {
    const { locale } = useLanguage();
    /**
     * The uid of the currently-expanded row, or null when the whole roster
     * is collapsed. One-at-a-time is enforced HERE (owner rows are static
     * and never expand, so they don't touch this).
     */
    const [openUid, setOpenUid] = useState<string | null>(null);
    /**
     * The uid whose Remove ConfirmDialog is armed, if any. Held on the
     * panel rather than per-row so tapping "Remove member" inside member
     * A's panel and then expanding member B doesn't leave A's dialog
     * dangling on top of a panel that no longer displays its trigger.
     */
    const [confirmingUid, setConfirmingUid] = useState<string | null>(null);

    const members = memberEntries(group);
    const soloOwner = members.length === 1;

    const handleToggleRow = (uid: string) => {
        setOpenUid((current) => (current === uid ? null : uid));
        // A confirm on the just-closed row is no longer meaningful.
        setConfirmingUid(null);
    };

    return (
        <section className="people-panel" aria-label={locale.members.title}>
            {/* One-line helper. Skipped in the single-member state — the
                nudge below carries the whole message on its own. */}
            {!soloOwner && (
                <p className="people-body">
                    {canManage
                        ? locale.members.peopleBody
                        : locale.members.peopleBodyReadOnly}
                </p>
            )}

            <ul className="people-list">
                {members.map((member) => (
                    <PersonItem
                        key={member.uid}
                        member={member}
                        group={group}
                        cars={cars}
                        canManage={canManage}
                        isOpen={openUid === member.uid}
                        onToggleRow={() => handleToggleRow(member.uid)}
                        isConfirming={confirmingUid === member.uid}
                        onArmConfirm={() => setConfirmingUid(member.uid)}
                        onCancelConfirm={() => setConfirmingUid(null)}
                        onConfirmRemove={() => {
                            setConfirmingUid(null);
                            onRemove(member);
                        }}
                        onToggleCarAdder={onToggleCarAdder}
                        onBulkEdit={onBulkEdit}
                        onTogglePerCarWrite={onTogglePerCar}
                        busyUid={busyUid}
                        bulkBusyUid={bulkBusyUid}
                    />
                ))}
            </ul>

            {/* Single-member state: the owner is alone. No permission UI
                would mean anything here; the nudge points them at the one
                useful next step. */}
            {soloOwner && canManage && (
                <div className="people-alone">
                    <p className="people-alone-text">
                        {locale.members.peopleAloneNudge}
                    </p>
                    {invitePath && (
                        <Link
                            to={invitePath}
                            className="people-alone-invite"
                        >
                            <UserPlus size={16} strokeWidth={2.5} aria-hidden="true" />
                            <span>{locale.members.peopleAloneInvite}</span>
                        </Link>
                    )}
                </div>
            )}
        </section>
    );
};

/**
 * Roster row + optional expanded panel for one member.
 *
 * Two shapes:
 *   • Owner   → static `<div>` row with an "Owner" summary chip and no
 *               chevron. The row is never expandable and renders no panel
 *               body underneath.
 *   • Member  → `<button>` row that toggles the panel body underneath.
 *               The panel is a subtly inset gray container holding the
 *               permission toggles + the per-car list + a bottom-right
 *               "Remove member" danger button.
 */
const PersonItem = ({
    member,
    group,
    cars,
    canManage,
    isOpen,
    onToggleRow,
    isConfirming,
    onArmConfirm,
    onCancelConfirm,
    onConfirmRemove,
    onToggleCarAdder,
    onBulkEdit,
    onTogglePerCarWrite,
    busyUid,
    bulkBusyUid,
}: {
    member: MemberEntry;
    group: Group;
    cars: Car[];
    canManage: boolean;
    isOpen: boolean;
    onToggleRow: () => void;
    isConfirming: boolean;
    onArmConfirm: () => void;
    onCancelConfirm: () => void;
    onConfirmRemove: () => void;
    onToggleCarAdder: (
        member: MemberEntry,
        allowed: boolean,
    ) => Promise<boolean>;
    onBulkEdit: (
        member: MemberEntry,
        allowed: boolean,
    ) => Promise<boolean>;
    onTogglePerCarWrite: (
        car: Car,
        uid: string,
        allowed: boolean,
    ) => Promise<boolean>;
    busyUid: string | null;
    bulkBusyUid: string | null;
}) => {
    const { locale } = useLanguage();

    /** A bulk write on THIS member is currently committing. Freezes per-car
     *  cells for the same member so a per-car flip can't half-commit on top
     *  of the bulk batch. */
    const isBulkBusy = bulkBusyUid === member.uid;

    // Non-implicit cars are the ones the bulk toggle can actually move. This
    // is also what the summary derivation reads.
    const eligible = cars.filter(
        (car) => !hasImplicitCarEdit(car, member.uid, group.ownerId),
    );
    const eligibleOn = eligible.filter((car) =>
        hasCarEdit(car, member.uid, group.ownerId),
    ).length;

    // Derived tri-state used by both the bulk toggle and the summary chip.
    // `always` here means "member holds edit on every car by implicit right"
    // — nothing for the bulk toggle to move. Zero eligible cars for a
    // non-owner reads as "always" too, but only when there are no cars in
    // the group at all; that case is handled in the panel body separately.
    const bulkState: "on" | "off" | "mixed" | "always" =
        eligible.length === 0
            ? "always"
            : eligibleOn === eligible.length
              ? "on"
              : eligibleOn === 0
                ? "off"
                : "mixed";

    const summary = deriveSummary(member, cars, bulkState);
    const summaryText =
        summary === "owner"
            ? locale.members.ownerBadge
            : summary === "can-edit"
              ? locale.cars.accessOn
              : summary === "view-only"
                ? locale.cars.accessOff
                : locale.members.peopleBulkMixed;

    // Owner rows are static — the row is not a button, there's no chevron,
    // and no panel body ever renders underneath. Everything the owner can do
    // is implicit and can't be revoked, so a switch would be a lie and the
    // absence of a chevron says "nothing to configure here".
    if (member.isOwner) {
        return (
            <li className="people-item">
                <div className="people-row people-row-static">
                    <Avatar name={member.username} isOwner />
                    <div className="people-identity">
                        <span className="people-name">{member.username}</span>
                        <span className="people-summary people-summary-owner">
                            {summaryText}
                        </span>
                    </div>
                </div>
            </li>
        );
    }

    return (
        <li className="people-item">
            <button
                type="button"
                className="people-row people-row-toggle"
                aria-expanded={isOpen}
                onClick={onToggleRow}
            >
                <Avatar name={member.username} isOwner={false} />
                <div className="people-identity">
                    <span className="people-name">{member.username}</span>
                    <span
                        className={`people-summary people-summary-${summary}`}
                    >
                        {summaryText}
                    </span>
                </div>
                <ChevronDown
                    size={18}
                    strokeWidth={2.5}
                    className={`people-row-chevron ${
                        isOpen ? "people-row-chevron-open" : ""
                    }`}
                    aria-hidden="true"
                />
            </button>

            {isOpen && (
                <div className="people-panel-body">
                    <div className="people-perms">
                        {/* "Can add cars to this group" — group-level
                            canAddCars toggle. Wrapped so rapid flips
                            coalesce into one settled write. */}
                        {canManage ? (
                            <CarAdderCell
                                group={group}
                                member={member}
                                onToggle={onToggleCarAdder}
                            />
                        ) : (
                            <p className="people-static">
                                {locale.members.carAdderLabel}:{" "}
                                {group.canAddCars.includes(member.uid)
                                    ? locale.cars.accessOn
                                    : locale.cars.accessOff}
                            </p>
                        )}

                        {/* "Can edit all cars" — bulk, DERIVED state. */}
                        {cars.length === 0 ? (
                            <p className="people-nocars">
                                {locale.members.peopleNoCars}
                            </p>
                        ) : bulkState === "always" ? (
                            <p className="people-static people-static-locked">
                                <Lock
                                    size={12}
                                    strokeWidth={2.5}
                                    aria-hidden="true"
                                />
                                <span>{locale.members.peopleBulkLabel}</span>
                            </p>
                        ) : canManage ? (
                            <BulkEditCell
                                member={member}
                                bulkState={bulkState}
                                eligibleCount={eligible.length}
                                onToggle={onBulkEdit}
                            />
                        ) : (
                            <p className="people-static">
                                {locale.members.peopleBulkLabel}:{" "}
                                {bulkState === "on"
                                    ? locale.cars.accessOn
                                    : bulkState === "off"
                                      ? locale.cars.accessOff
                                      : locale.members.peopleBulkMixed}
                            </p>
                        )}
                    </div>

                    {/* Per-car section — always visible, no collapsible.
                        The uppercase label reads as a category header, not
                        a control. When "Edit all cars" is ON, each per-car
                        switch is muted-and-disabled: the reader can see the
                        effective state without half-fighting the bulk
                        grant. */}
                    {cars.length > 0 && (
                        <div className="people-percar">
                            <p className="people-percar-label">
                                {locale.members.perCarSectionLabel}
                            </p>
                            <ul className="people-cars">
                                {cars.map((car) => (
                                    <li
                                        key={car.id}
                                        className="people-car"
                                    >
                                        <span className="people-car-name">
                                            {carDisplayName(car)}
                                        </span>
                                        <AccessCell
                                            car={car}
                                            member={member}
                                            group={group}
                                            canManage={canManage}
                                            onToggle={onTogglePerCarWrite}
                                            bulkBusy={isBulkBusy}
                                            bulkOn={bulkState === "on"}
                                        />
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {canManage && (
                        <div className="people-panel-actions">
                            <button
                                type="button"
                                className="people-remove"
                                onClick={onArmConfirm}
                                disabled={busyUid === member.uid}
                                aria-label={`${locale.members.remove} ${member.username}`}
                            >
                                {locale.members.removeMemberAction}
                            </button>
                        </div>
                    )}
                </div>
            )}

            {isConfirming && (
                <ConfirmDialog
                    title={locale.members.removeTitle}
                    prompt={locale.members.removeConfirmStrong
                        .replace("{name}", member.username)
                        .replace("{group}", group.name)}
                    confirmLabel={locale.members.removeYes}
                    cancelLabel={locale.members.cancel}
                    onConfirm={onConfirmRemove}
                    onCancel={onCancelConfirm}
                    isBusy={busyUid === member.uid}
                    busyLabel={locale.common.processing}
                />
            )}
        </li>
    );
};

type Summary = "owner" | "can-edit" | "view-only" | "custom";

/**
 * The four states the summary chip can hold. Reads from data already loaded
 * by the parent — no new listeners, no reads per row.
 *
 * A member with implicit edit on every car (they created them all) surfaces
 * as "can-edit" here: the outcome is what the summary should communicate,
 * not the mechanism. The bulk toggle in the panel still degenerates to a
 * locked "always" line for the same case — that's a truthful signal about
 * whether the switch can move, which is a different question.
 */
const deriveSummary = (
    member: MemberEntry,
    cars: Car[],
    bulkState: "on" | "off" | "mixed" | "always",
): Summary => {
    if (member.isOwner) return "owner";
    if (cars.length === 0) return "view-only";
    if (bulkState === "always" || bulkState === "on") return "can-edit";
    if (bulkState === "off") return "view-only";
    return "custom";
};

/**
 * Initials avatar — one letter for a single-word name, first-and-last for
 * two-or-more. Capped at two characters so a very long name doesn't stretch
 * the circle. Falls back to "?" only if the name is genuinely empty, which
 * `users/{uid}.username` rules prevent at write time anyway.
 */
const initials = (name: string): string => {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    const first = parts[0].charAt(0);
    const last = parts[parts.length - 1].charAt(0);
    return `${first}${last}`.toUpperCase();
};

const Avatar = ({ name, isOwner }: { name: string; isOwner: boolean }) => (
    <span
        className={`people-avatar ${
            isOwner ? "people-avatar-owner" : "people-avatar-member"
        }`}
        aria-hidden="true"
    >
        {initials(name)}
    </span>
);

/** One member's access to one car — a toggle, a locked badge, or a plain state.
    Lifted from the old AccessGrid so the two-panel merge doesn't drop any
    behaviour: implicit holders still get a locked badge with an explanatory
    title, read-only viewers still see the same facts as a chip.

    Interactive form goes through `useDebouncedToggle`: rapid flip-back
    within the 600ms window collapses to zero writes, and the round-trip
    itself locks the switch. */
const AccessCell = ({
    car,
    member,
    group,
    canManage,
    onToggle,
    bulkBusy,
    bulkOn,
}: {
    car: Car;
    member: MemberEntry;
    group: Group;
    canManage: boolean;
    onToggle: (car: Car, uid: string, allowed: boolean) => Promise<boolean>;
    /** While a bulk flip is running for this member every per-car cell freezes,
        so the reader can't half-commit a per-car flip on top of it. */
    bulkBusy: boolean;
    /** Bulk "edit all cars" is currently ON — per-car switches then render as
        checked-and-disabled with reduced opacity. The reader still sees each
        car's effective state without being able to half-fight the bulk grant. */
    bulkOn: boolean;
}) => {
    const { locale } = useLanguage();
    const { addToast } = useToast();

    const implicit = hasImplicitCarEdit(car, member.uid, group.ownerId);
    const canEdit = hasCarEdit(car, member.uid, group.ownerId);
    const label = locale.cars.accessToggleLabel
        .replace("{name}", member.username)
        .replace("{car}", carDisplayName(car));

    // Hook is called unconditionally so a switch from implicit → normal
    // (rare, but possible if a car changes creator through a future path)
    // doesn't break React's hook order. Its `value`/`pending` go unused in
    // the implicit / read-only branches below.
    const { value, pending, onChange } = useDebouncedToggle({
        serverValue: canEdit,
        onSettle: async (next) => {
            const ok = await onToggle(car, member.uid, next);
            if (ok) {
                addToast(
                    (next
                        ? locale.cars.accessGranted
                        : locale.cars.accessRevoked
                    )
                        .replace("{name}", member.username)
                        .replace("{car}", carDisplayName(car)),
                    "info",
                    // Per-cell kind so two different cells never overwrite
                    // each other's confirmations.
                    { kind: `access:${car.id}:${member.uid}` },
                );
            }
            return ok;
        },
        onError: () =>
            addToast(locale.errors.accessToggleFailed, "error", {
                kind: `access-error:${car.id}:${member.uid}`,
            }),
    });

    if (implicit) {
        return (
            <span
                className="people-access-locked"
                title={
                    member.uid === group.ownerId
                        ? locale.cars.accessImplicitOwner
                        : locale.cars.accessImplicitCreator
                }
            >
                <Lock size={12} strokeWidth={2.5} aria-hidden="true" />
                <span>{locale.cars.accessImplicit}</span>
            </span>
        );
    }

    if (!canManage) {
        return (
            <span
                className={`people-access-state ${
                    canEdit ? "people-access-state-on" : ""
                }`}
            >
                {canEdit ? locale.cars.accessOn : locale.cars.accessOff}
            </span>
        );
    }

    return (
        <ToggleSwitch
            checked={bulkOn ? true : value}
            onChange={onChange}
            label={label}
            labelHidden
            pending={pending}
            disabled={pending || bulkBusy || bulkOn}
        />
    );
};

/** "Can add cars to this group" — group-level canAddCars toggle, wrapped in
    the same debounce clock so a rapid flip doesn't fan out into a burst of
    setDoc calls. Toasts on settled success only, via the shared
    `useDebouncedToggle` hook. */
const CarAdderCell = ({
    group,
    member,
    onToggle,
}: {
    group: Group;
    member: MemberEntry;
    onToggle: (member: MemberEntry, allowed: boolean) => Promise<boolean>;
}) => {
    const { locale } = useLanguage();
    const { addToast } = useToast();

    const server = group.canAddCars.includes(member.uid);
    const { value, pending, onChange } = useDebouncedToggle({
        serverValue: server,
        onSettle: async (next) => {
            const ok = await onToggle(member, next);
            if (ok) {
                addToast(
                    (next
                        ? locale.members.carAdderGranted
                        : locale.members.carAdderRevoked
                    ).replace("{name}", member.username),
                    "info",
                    { kind: `adder:${member.uid}` },
                );
            }
            return ok;
        },
        onError: () =>
            addToast(locale.errors.accessToggleFailed, "error", {
                kind: `adder-error:${member.uid}`,
            }),
    });

    return (
        <ToggleSwitch
            checked={value}
            onChange={onChange}
            label={locale.members.carAdderLabel}
            layout="split"
            pending={pending}
            disabled={pending}
        />
    );
};

/** "Can edit all cars" — bulk toggle over N cars, wrapped in the same
    debounce clock. The parent still computes tri-state (`on`/`off`/`mixed`)
    from the loaded cars; the debounce hook drives what the switch reads at
    the moment of interaction.

    ── Mixed state ────────────────────────────────────────────────────────
    Mixed renders `checked=false` with a "Custom" hint under the label. The
    hook's `serverValue` follows that (mixed → server=false), so flipping ON
    fires a settled write with `true` (bulk grant); flipping OFF within the
    debounce window collapses to zero writes because the hook sees false→
    false. This matches the pre-debounce behaviour that the emulator + hook
    tests already pin down. */
const BulkEditCell = ({
    member,
    bulkState,
    eligibleCount,
    onToggle,
}: {
    member: MemberEntry;
    bulkState: "on" | "off" | "mixed";
    /** Non-implicit-and-eligible cars — how many would settle in the
     *  success toast's count field. */
    eligibleCount: number;
    onToggle: (member: MemberEntry, allowed: boolean) => Promise<boolean>;
}) => {
    const { locale } = useLanguage();
    const { addToast } = useToast();

    const serverOn = bulkState === "on";
    const { value, pending, onChange } = useDebouncedToggle({
        serverValue: serverOn,
        onSettle: async (next) => {
            const ok = await onToggle(member, next);
            if (ok) {
                addToast(
                    (next
                        ? locale.cars.accessBulkGranted
                        : locale.cars.accessBulkRevoked
                    )
                        .replace("{name}", member.username)
                        .replace("{count}", String(eligibleCount)),
                    "info",
                    { kind: `bulk:${member.uid}` },
                );
            }
            return ok;
        },
        onError: () =>
            addToast(locale.errors.accessToggleFailed, "error", {
                kind: `bulk-error:${member.uid}`,
            }),
    });

    return (
        <ToggleSwitch
            checked={value}
            onChange={onChange}
            label={locale.members.peopleBulkLabel}
            hint={
                bulkState === "mixed"
                    ? locale.members.peopleBulkHint
                    : undefined
            }
            layout="split"
            pending={pending}
            disabled={pending}
        />
    );
};

export default PeoplePanel;
