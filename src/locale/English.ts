export const strings = {
    appName: "Journey Care",
    login: {
        tabTitle: "Login",
        welcomeTitle: "Welcome Back",
        subtitle: "Sign in to access your car logs",
        submitButton: "Log In",
        forgotPassword: "Forgot Password?",
        footerText: "Don't have an account?",
        footerLink: "Sign Up",
    },
    register: {
        tabTitle: "Sign Up",
        welcomeTitle: "Get Started",
        subtitle: "Create an account to track your rides",
        submitButton: "Create Account",
        footerText: "Already have an account?",
        footerLink: "Log in",
    },
    fields: {
        emailLabel: "EMAIL ADDRESS",
        emailPlaceholder: "driver@example.com",
        passwordLabel: "PASSWORD",
        passwordPlaceholder: "********",
        createPasswordPlaceholder: "Create a strong password",
        usernameLabel: "DISPLAY NAME",
        usernamePlaceholder: "e.g. Alex",
        confirmPasswordLabel: "CONFIRM PASSWORD",
        confirmPasswordPlaceholder: "Re-enter your password",
    },
    /** One-time username screen [A6] */
    username: {
        title: "What should we call you?",
        subtitle: "This is the name your groups will see.",
        hint: "You can pick anything — 3 to 20 characters.",
        submitButton: "Continue",
        saved: "Nice to meet you, {username}!",
        signOut: "Use a different account",
    },
    social: {
        google: "Continue with Google",
    },
    /** Verify-email gate [A4] */
    verify: {
        title: "Check your inbox",
        subtitle: "We sent a verification link to",
        hint: "Click the link in that email, then come back and continue.",
        checkButton: "I've verified",
        resendButton: "Resend email",
        resendCooldown: "Resend in {seconds}s",
        resendSuccess: "Verification email sent. Check your inbox.",
        stillWaiting: "Not verified yet — click the link in the email, then try again.",
        verified: "Email verified. Welcome aboard!",
        signOut: "Use a different account",
    },
    /** Forgot-password flow [A7] */
    reset: {
        prompt: "Enter your email address and we'll send you a reset link.",
        missingEmail: "Enter your email address first, then tap Forgot Password.",
        sent: "Password reset email sent. Check your inbox.",
    },
    home: {
        greeting: "Hello",
        /** Time-of-day greetings, ordered morning → night. Sentence case,
            no exclamation — the app is a car log, not a delivery app. */
        greetingMorning: "Good morning",
        greetingAfternoon: "Good afternoon",
        greetingEvening: "Good evening",
        greetingNight: "Hello",
        signOut: "Sign out",
        groupsTitle: "Your groups",
        /** Groups you own. [Item 5] */
        ownedTitle: "Your groups",
        /** Groups you're a member of but don't own. [Item 5] */
        joinedTitle: "Joined",
        /** Marks an owned group in the list. */
        ownerBadge: "Owner",
        memberCount: "{count} member",
        memberCountPlural: "{count} members",
        createGroup: "Create group",
        joinGroup: "Join group",
        loadingGroups: "Loading your groups…",
        emptyTitle: "No groups yet",
        emptyBody: "Create one for your family, or join with a code.",
    },
    /** Groups core [G1, G2, G11] */
    groups: {
        createTitle: "Create a group",
        createSubtitle: "Share cars and maintenance with your family.",
        /** Sentence case — the CardShell scope renders labels as written,
            not upper-cased. [Shell polish] */
        nameLabel: "Group name",
        /** Real example — the placeholder IS the example, no "e.g." prefix
            required. [Shell polish] */
        namePlaceholder: "Family Cars",
        nameHint:
            "You'll be the owner. Once it's set up, share the invite link with everyone who should see the cars.",
        createButton: "Create group",
        created: "{name} is ready.",
        loading: "Loading group…",
        notFoundTitle: "Group not found",
        notFoundBody:
            "This group doesn't exist, or you're not a member of it.",
        deleteTitle: "Delete group",
        deleteBody: "Deleting a group removes it for everyone in it.",
        deleteButton: "Delete group",
        deleteConfirmPrompt:
            "This deletes {name}, all its cars, and every log — for everyone. This can't be undone.",
        deleteConfirmButton: "Delete",
        deleteCancelButton: "Cancel",
        deleted: "Group deleted.",
        backHome: "Back to home",

        /** Owner-only rename. [G12] */
        renameLabel: "Rename group",
        renameFieldLabel: "GROUP NAME",
        renameSave: "Save",
        renameCancel: "Cancel",
        renamed: "Renamed to {name}.",

        /** The group's own screen is the cars space. [Item 4] */
        carsTitle: "Cars",
        carsSoonTitle: "Cars arrive soon",
        carsSoonBody:
            "This is where the cars you share will live, with their maintenance and running costs.",
        /** Summary line under the group name: "4 members · You own this". */
        summaryOwner: "You own this group",
        summaryMember: "You're a member",
        /** Links out to the two sub-screens. [Item 4] */
        navMembers: "Members",
        navMembersHint: "See who's in this group",
        navMembersHintOwner: "Manage who's in this group",
        navInvite: "Invite people",
        navInviteHint: "QR code and invite link",
        backToGroup: "Back to group",
        /** Non-owner who reached /invite by URL. */
        inviteOwnerOnlyTitle: "Only the owner can invite",
        inviteOwnerOnlyBody:
            "Ask the group's owner to send you their invite link or QR code.",

        /** Manage group screen. [UX phase-2, 2d] */
        manageTitle: "Manage group",
        /** Short label for the title-row Manage button. [polish] */
        manageEntry: "Manage",
        /** Owner-only banner above What's due when join requests are pending.
            The Manage button gets a small amber dot as belt-and-suspenders. */
        pendingBannerOne: "1 person waiting to join",
        pendingBannerMany: "{count} people waiting to join",
        pendingBannerAction: "Review",
        manageRenameSection: "Rename group",
        manageMembersHint: "See and manage people",
        manageInviteHint: "Show QR code or share link",
        manageReviewSection: "Requests to join",
        manageFixTotalsHint:
            "Re-reads every service and rewrites the totals. Only if a number looks wrong.",
        /** Group name row in the admin card, and its right-side button. */
        manageNameTitle: "Group name",
        manageNameRename: "Rename",
        /** Quiet centered link at the bottom of Manage that opens the
            confirm-then-recalculate flow. Demotes what used to be a Fix
            totals card — the action is rare, and only sought when a number
            looks wrong. */
        fixTotalsLink: "Numbers look wrong? Fix totals",
    },
    /** Join flow [G3–G7] */
    join: {
        inviteTitle: "Invite people",
        inviteBody: "Anyone with this link can ask to join. You approve them.",
        /** Sentence case — matches Settings and Join. The old caps eyebrow
            read as a form-field label, but this row is a link display. */
        inviteLinkLabel: "Invite link",
        copyLink: "Copy link",
        /** Copy button's transient success state (~2s). [R9] */
        copyLinkDone: "Copied",
        copied: "Copied to clipboard.",
        copyFailed: "Couldn't copy — select the text and copy it manually.",
        /** Mobile-only Share primary CTA. Falls back to Copy on desktop. */
        shareLink: "Share link",
        shareTitle: "Join {group} on Journey Care",
        qrHint: "Point a phone camera at this code",
        missingToken:
            "This group's invite isn't set up yet. Ask the group owner to open the invite screen once — that'll fix it.",

        pendingTitle: "Requests to join",
        pendingEmpty: "No one's waiting to join",
        accept: "Approve",
        decline: "Decline",
        accepted: "{name} is in.",
        declined: "Request declined.",

        joinTitle: "Join a group",
        joinPrompt: "You've been invited to",
        /** Sub-copy under the group name on the valid-invite state. */
        joinPromptHint:
            "Ask to join, and the owner will decide. You'll get a notification either way.",
        requestButton: "Request to join",
        requestSent: "Request sent. The group owner will review it.",
        checking: "Checking your invite…",

        // Invite tokens never expire (G3) — no message here may suggest they do.
        invalidLinkTitle: "This invite link is incomplete",
        invalidLinkBody:
            "The link looks truncated. Copy the whole thing, or scan the QR code again.",
        groupMissingTitle: "That group no longer exists",
        groupMissingBody:
            "It may have been deleted by its owner. Ask them for a new invite.",
        rejectedTitle: "This invite code wasn't accepted",
        rejectedBody:
            "The code doesn't match this group. Ask the owner for the current invite link — codes don't expire, so it was most likely mistyped or replaced.",
        errorTitle: "Couldn't check this invite",
        errorBody:
            "We hit a permission problem reading this invite. Check you're signed in with the right account, then try again.",
        alreadyMemberTitle: "You're already in",
        alreadyMemberBody: "You're a member of this group already.",
        alreadyPendingTitle: "Waiting for the owner",
        alreadyPendingBody:
            "You've asked to join this group. You'll get a notification when the owner approves or declines the request.",
        openGroup: "Open group",

        // Join entry [G4, platform-adaptive polish]
        entryTitle: "Join a group",
        /** Phone subtitle — the one thing the joiner needs to do. */
        askOwnerToShow: "Ask the group owner to show you their QR code",
        /** Desktop support line under Continue — names the phone-only path
            that isn't available on this device, so the reader isn't left
            wondering whether they missed it. */
        onPhoneTip: "On your phone? Just scan the QR code with your camera",
        scanButton: "Scan QR code",
        stopScanning: "Stop scanning",
        scanDenied: "Camera permission denied. Paste the link instead.",
        /** Phone-only quiet text link that reveals the paste form. */
        haveLinkInstead: "Have a link instead?",
        pasteLabel: "Paste the invite link",
        /** Real example rather than another restatement of the instruction.
            Truncated so it hints at the shape without demanding a scroll. */
        pastePlaceholder: "car-log-project.web.app/join/…",
        pasteButton: "Continue",
        pasteInvalid: "That link doesn't look right. Check it and try again.",
    },
    /** Cars [C1–C3, C10] */
    cars: {
        sectionTitle: "Cars",
        sectionTitleWithCount: "Cars ({count})",
        addButton: "Add car",
        addTitle: "Add a car",
        addSubtitle: "Pick it from the list, or enter it yourself.",
        /** Reason surfaced beside the disabled Save on Add — names what's
            missing so the button isn't a dead-end. */
        addDisabledHint: "Pick a brand, model and year to continue.",
        loading: "Loading cars…",
        emptyTitle: "No cars yet",
        emptyBody: "Add the first one and the family can start logging its upkeep.",
        emptyBodyReadOnly:
            "Nobody has added a car to this group yet. The group's owner can let you add one.",

        /** Per-car due status line on CarCard. Nearest attention item only,
            plus an "Up to date" line for cars with nothing outstanding. */
        cardStatusOk: "Up to date",
        cardStatusDueSoon: "{type} due soon",
        cardStatusOverdue: "{type} overdue",

        brandLabel: "Brand",
        brandPlaceholder: "Choose a brand",
        brandOtherLabel: "Brand name",
        brandOtherPlaceholder: "e.g. Volkswagen",
        modelLabel: "Model",
        modelPlaceholder: "Choose a model",
        modelOtherLabel: "Model name",
        modelOtherPlaceholder: "e.g. Golf",
        yearLabel: "Year",
        yearPlaceholder: "Choose a year",

        optionalTitle: "Optional details",
        nicknameLabel: "Nickname",
        nicknamePlaceholder: "Mum's Myvi",
        nicknameHint: "Give it a name the family uses.",
        plateLabel: "Plate number",
        platePlaceholder: "e.g. WXY 1234",
        odometerLabel: "Mileage (km)",
        odometerPlaceholder: "e.g. 128400",
        odometerHint: "Leave it blank if you're not sure — you can set it later.",

        saveButton: "Add car",
        added: "{name} added.",

        /**
         * Car detail page [C8, C9, C5, C10]
         *
         * The read-only fact grid these labelled — Details / Make & model /
         * Year / Plate / Nickname / Added by — is gone. The car page is about
         * servicing, and every value on that grid is either in the header
         * already or on the edit screen, which is where you go to change one.
         * The strings went with it rather than sitting in the bundle for a
         * panel that no longer renders.
         */
        backToCars: "Back to cars",

        editTitle: "Edit car",
        editButton: "Edit details",
        editSave: "Save changes",
        detailsSaved: "Car updated.",
        /** Shown to a member who can view but not edit. */
        readOnlyNote: "Only people with edit access can change this car.",

        odometerTitle: "Mileage",
        odometerNone: "Not recorded yet",
        odometerUpdate: "Update",
        odometerSave: "Save mileage",
        odometerCancel: "Cancel",
        odometerSaved: "Mileage updated.",
        odometerCorrectedOn: "Corrected {date}",
        /** Odometer snap [T23, ODO1-ODO4]. Behind AI_CONFIG.scanEnabled. */
        scanOdometer: "Snap odometer",
        scanOdometerProcessing: "Reading…",
        scanOdometerRead: "Ready to confirm.",
        scanOdometerRetake:
            "Couldn't read a valid reading — retake or type it manually.",
        scanOdometerUnreadable:
            "Couldn't read that — retake or type it manually.",
        scanOdometerQuota: "Scan limit reached today — type it manually.",
        /** The monotonic guard's confirm step. [C9] */
        odometerLowerTitle: "That's lower than the last mileage",
        odometerLowerBody:
            "This car shows {current}. Mileage doesn't go backwards, so save {next} only if you're correcting a mistake.",
        odometerLowerConfirm: "Yes, correct it",

        photoTitle: "Photo",
        /** Section header on the Details card (AddCar + EditCar). Small
            icon + sentence-case title, matching the app's other card
            headers. */
        detailsTitle: "Details",
        photoAdd: "Add photo",
        /** Single action for both "no photo yet" and "replace existing" —
            crop/adjust happens INSIDE this flow, not as a sibling button. */
        photoChange: "Change photo",
        /** Destructive-secondary button paired beside Change photo. Full
            label ("Remove photo") so it matches the weight of its
            neighbour; the bare "Remove" read as a hint next to a real
            button. Reused inside the ConfirmDialog too, matching the
            Delete group pattern (title + confirm both name the noun). */
        photoRemove: "Remove photo",
        /** ConfirmDialog title on the Edit car photo section. */
        photoRemoveTitle: "Remove photo",
        /** ConfirmDialog prompt on the Edit car photo section. [Car polish] */
        photoRemoveConfirm:
            "Remove this photo? The car will show a placeholder icon instead.",
        photoSaved: "Photo saved.",
        photoRemoved: "Photo removed.",
        photoWorking: "Preparing photo…",
        photoHint: "Taken on your phone, shrunk to fit. Stays inside the group.",
        /** The crop / rotate modal opened after picking a file, or from Edit. */
        photoEditTitle: "Adjust photo",
        photoEditRotate: "Rotate",
        photoEditSave: "Save photo",
        photoEditCancel: "Cancel",
        /** Accessible label on the zoom range control in the crop modal —
            not a visible caption; the ± icon buttons flanking it are the
            visible affordance. */
        photoEditZoom: "Zoom",
        photoEditZoomOut: "Zoom out",
        photoEditZoomIn: "Zoom in",
        photoTooLarge:
            "That image is too large even after shrinking. Try a smaller one, or a photo rather than a screenshot.",
        /**
         * Last resort only — the pipeline decodes HEIC wherever the platform
         * can, so this means the browser genuinely has no codec for it.
         */
        photoUnreadable:
            "This browser can't read that image. If it came from an iPhone, either send it to yourself first (which converts it to JPEG), or set Settings → Camera → Formats → Most Compatible.",

        /** Per-car edit access. [C6, C7, N6] */
        accessTitle: "Who can edit each car",
        accessBody:
            "Everyone in the group can see every car. Turn a switch on to let someone update that car's details, mileage and logs.",
        accessBodyReadOnly:
            "Everyone in the group can see every car. The owner decides who can edit each one.",
        accessNoCars: "Add a car and the edit switches appear here.",
        accessColumnMember: "Member",
        accessImplicit: "Always",
        accessImplicitOwner: "Group owner — always has edit",
        accessImplicitCreator: "Added this car — always has edit",
        accessOn: "Can edit",
        accessOff: "View only",
        /** Screen-reader label for one cell. */
        accessToggleLabel: "Let {name} edit {car}",
        accessGranted: "{name} can now edit {car}.",
        accessRevoked: "{name} can no longer edit {car}.",
        /** Toast summarising a bulk grant / revoke on the People card. [Bulk] */
        accessBulkGranted: "{name} can now edit {count} car(s).",
        accessBulkRevoked: "{name} can no longer edit {count} car(s).",
        /** The accordion's summary line under a member's name. */
        accessSummary: "Can edit {count} of {total}",

        deleteTitle: "Delete car",
        deleteBody:
            "Deleting a car removes it and its whole maintenance history, for everyone in the group.",
        deleteButton: "Delete car",
        deleteConfirmPrompt:
            "This deletes {car} and its whole service history — for everyone in the group. This can't be undone.",
        deleteConfirmButton: "Delete",
        deleteCancelButton: "Cancel",
        deleted: "Car deleted.",
        /** Shown to a member the owner hasn't granted car-adding rights. */
        cannotAddTitle: "You can't add cars here",
        cannotAddBody:
            "The group's owner decides who can add cars. Ask them to turn it on for you.",
    },
    /** Next-due reminders [R1–R4] */
    due: {
        timelineTitle: "Maintenance timeline",
        filterStatus: "Filter by service status",
        filterAll: "All services",
        filterEmpty: "No services match this filter.",
        mileageLastMatched: "Same reading logged at service on {date}",
        mileageRecordedOn: "Recorded on {date}",
        mileageDateUnknown: "Recording date unknown.",
        maintenanceLabel: "Maintenance",
        viewTimeline: "View timeline",
        noScheduledServices: "No services scheduled",
        mileageNeeded: "Mileage update needed",
        lastServiceDate: "Last serviced {date}",
        lastServiceWithKm: "Last serviced {date} at {km} km",
        onTrack: "On track",
        daysLeft: "{count} days left",
        daysOver: "{count} days overdue",
        kmLeft: "{count} km left",
        kmOver: "{count} km overdue",
        updateOdometer: "Update the odometer to see kilometres remaining.",
        title: "What's next",
        ok: "OK",
        dueSoon: "Due soon",
        overdue: "Overdue",
        /** R1's wording. */
        byDate: "Due by {date}",
        atKm: "at {km} km",
        join: " or ",
        allGood: "Nothing due right now",
        noneTracked:
            "Log a service with an interval and its next due date shows up here.",
        showOk: "{count} not due yet",

        /** Group page [R3] */
        groupTitle: "What's due",
        /** Matches the Home strip's wording so both surfaces read the same
            once every car is settled. [polish] */
        groupNothing: "All cars are up to date",

        /** Home strip [R3] */
        stripOverdue: "{count} overdue",
        stripDueSoon: "{count} due soon",
        stripNothing: "Nothing due",
        stripAria: "Maintenance due across your groups",
        /** Zone A support lines under the headline. [Home polish] */
        stripAllUpToDate: "All cars are up to date",
        /** Names the nearest attention item — "Engine oil · Mum's Myvi". */
        stripNearestSep: " · ",
        stripAttentionCars: "{count} cars need attention",
    },
    /** Maintenance logs [L1–L6] */
    logs: {
        historyTitle: "Service history",
        addButton: "Log a service",
        /** Chevron-row subtitle on the Car page's action card. Plain-language
         *  description of a single-entry log so a first-time family member
         *  knows which of the two rows to tap. */
        addHint: "One item — e.g. engine oil change",
        addTitle: "Log a service",
        /** Header subtitle on the AddLog page — one line under the title,
         *  above the car name. Tells the user which of the two forms they
         *  are in without them having to compare the buttons. */
        addSubtitle: "One maintenance item — sets its next-due reminder",
        editTitle: "Edit this entry",
        loading: "Loading history…",
        emptyTitle: "No services logged yet — add the first one.",
        loadMore: "Load older",
        /** History search — client-side over the loaded page. [L6] */
        searchLabel: "Search this history",
        searchPlaceholder: "Type, notes, who, or cost…",
        searchClear: "Clear search",
        searchCount: "{count} match",
        searchCountPlural: "{count} matches",
        searchEmptyTitle: "Nothing here matches “{query}”.",
        searchScopeNote:
            "Searching the entries loaded so far. Load older to search further back.",
        loggedBy: "Logged by {name}",
        someone: "someone",
        notesShow: "Notes",
        /** Expanded row: shows mileage, notes and who logged it. [UX 2b] */
        detailsShow: "Details",
        detailsAtKm: "At {km}",
        /** Progressive disclosure on the log form. [UX 2c] */
        moreOptionsShow: "More options",
        moreOptionsHide: "Hide options",
        edit: "Edit",
        delete: "Delete",
        /** ConfirmDialog title on the log row's delete flow. [Car polish → modal] */
        deleteTitle: "Delete entry",
        deleteConfirm: "Delete this {type} entry? This updates the car's totals and next-due dates.",
        deleteYes: "Delete",
        deleteCancel: "Cancel",
        backToCar: "Back to the car",
        /** Native confirm() prompt fired by the top-left back button on
            AddLog and AddVisit when the form has unsaved content. Simple
            single-line message — a native confirm has no room for more. */
        discardEntryPrompt: "Discard this entry?",

        typeLabel: "WHAT WAS DONE",
        /** "type" for both forms — avoids the service/visit word clash. */
        typePlaceholder: "Choose a maintenance type",
        customLabel: "DESCRIBE IT",
        customPlaceholder: "e.g. New headlight bulb",
        costLabel: "COST (RM)",
        costPlaceholder: "e.g. 250.00",
        dateLabel: "WHEN",
        /** Renamed from "Mileage at service (km)" for form-agnostic reuse. */
        odometerLabel: "ODOMETER (KM)",
        odometerPlaceholder: "e.g. 128400",
        odometerHint:
            "Worth filling in — it's what the next-due reminder counts from.",
        bumpOdometer: "Also update this car's current mileage to {km} km",
        /**
         * Service-form notes label. Still hints at workshop because the
         * service form doesn't have a separate Workshop field — this is
         * where the workshop name goes on a single-entry log.
         *
         * The visit form uses `visitItemNotesLabel` instead: workshop is
         * asked once at visit level, so per-item notes are just notes.
         */
        notesLabel: "WORKSHOP OR NOTES",
        notesPlaceholder: "e.g. Ah Seng Auto, used synthetic",

        intervalTitle: "Next due",
        intervalKmLabel: "EVERY (KM)",
        intervalMonthsLabel: "EVERY (MONTHS)",
        intervalNone: "—",
        intervalSummaryNone: "No reminder for this one.",
        intervalSummaryOne: "You'll be reminded when this is due.",
        intervalSummaryBoth: "Due at whichever comes first.",
        intervalReset: "Back to the usual interval",

        save: "Save entry",
        entryUnavailable: "This service entry is unavailable. Go back to Service History to see the current list.",
        saveEdit: "Save changes",
        added: "Service logged.",
        updated: "Entry updated.",
        deleted: "Entry deleted.",

        /**
         * Visit-based logging [T17, V1–V5].
         *
         * A visit is one date, one workshop, one shared odometer, and N items.
         * The quick-log path (single entry) is kept unchanged — this is its
         * many-items sibling for the receipt-in-hand case.
         */
        visitAddButton: "Log a visit",
        /** Chevron-row subtitle on the Car page's action card. Explains the
         *  many-items sibling of "Log a service", and calls out that a visit
         *  is also where a shelf part gets installed — otherwise the shelf-
         *  install entry point is invisible from the car page. */
        visitAddHint:
            "A workshop trip — several services in one go, including shelf parts",
        visitAddTitle: "Log a workshop visit",
        /** Header subtitle on AddVisit — one line under the title. Distinguishes
         *  this from the service form at a glance. */
        visitAddSubtitle: "One trip — everything done that day",
        visitWorkshopLabel: "WORKSHOP",
        visitWorkshopPlaceholder: "e.g. Ah Seng Auto",
        /** Visit-form per-item notes. Workshop is asked once at the top of
         *  the visit, so per-item notes are just notes — no workshop hint.
         *  Same underlying LogDoc.notes field is written. */
        visitItemNotesLabel: "NOTES",
        visitItemNotesPlaceholder: "e.g. used fully synthetic",
        visitItemsHeading: "Items",
        visitItemHeading: "Item {index}",
        /** Collapsed-row hint when the item has no notes to show. */
        visitItemNoNotes: "No notes",
        /** Running total row above the Save button. */
        visitTotalItemsOne: "1 item",
        visitTotalItemsMany: "{count} items",
        visitTotalAmount: "Total {amount}",
        visitAddItem: "Add another item",
        visitRemoveItem: "Remove item",
        visitNothingLogged: "Add at least one item before saving.",
        visitSaveButton: "Save visit",
        visitSaved: "Visit logged.",
        /** [PRT5] Per-item toggle: this line stocks the shelf, not a log.
         *  Plain-language rewrite (no "parts shelf" jargon in the label). */
        visitToShelf: "Bought to install later — no reminder until installed",
        visitShelfItemUnavailable: "This shelf item changed or is no longer available. Return to the Parts Shelf to try again.",
        /** Only shown when the checkbox is CHECKED. Explains the accounting
         *  side (cost stays on the shelf, next-due starts at install). */
        visitToShelfHint:
            "This goes to the parts shelf. The reminder timer and the spend both start the moment you install it.",

        /** Receipt scan [T22, AI1-AI5]. Fallbacks per AI4. */
        scanReceipt: "Scan receipt",
        scanReceiptHint:
            "Snap the receipt and we'll fill in the form. You save nothing until you review it.",
        scanProcessing: "Reading the receipt…",
        scanReady: "Ready to review — check each line.",
        scanUnreadable:
            "Couldn't read that — try retaking, or fill it in manually.",
        scanQuotaExhausted: "Scan limit reached today — fill it in manually.",
        scanReviewLowConfidence:
            "{count} line(s) came back uncertain — please double-check.",
        scanReviewCustom:
            "{count} line(s) didn't match a service type — pick one or use Custom.",
    },
    /** Parts shelf [T18, PRT1–PRT7] */
    parts: {
        /** Card title on the car page. Collapsed when empty. */
        shelfTitle: "Parts shelf",
        shelfEmpty: "No parts on the shelf.",
        shelfEmptyHint:
            "Buy an oil filter or brake pads before you install them? Add it here — the reminder timer starts when you fit it, not when you bought it.",
        shelfValue: "Shelf value",
        addPart: "Add a part",
        addTitle: "Add a part",
        editTitle: "Edit part",
        addSubtitle: "For parts you've bought but haven't installed yet.",
        typeLabel: "WHAT PART",
        typePlaceholder: "Choose a type",
        customLabel: "DESCRIBE IT",
        customPlaceholder: "e.g. Cabin air filter",
        partLabelLabel: "LABEL (OPTIONAL)",
        partLabelPlaceholder: "e.g. Amsoil 5W-30 4L",
        partLabelHint:
            "A short name so you can tell two of the same type apart on the shelf.",
        costLabel: "COST (RM)",
        costPlaceholder: "e.g. 45.00",
        purchaseDateLabel: "BOUGHT ON",
        notesLabel: "NOTES",
        notesPlaceholder: "e.g. Bought at Ah Seng Auto",
        saveButton: "Add to shelf",
        editSaveButton: "Save",
        added: "Part added to shelf.",
        updated: "Part updated.",
        editInstalled:
            "This part is already installed. Edit the service log instead.",
        deleted: "Part removed from shelf.",
        deleteInstalled:
            "This part is already installed. Delete the service log to remove it.",
        cancel: "Cancel",
        close: "Close",

        install: "Install",
        installTitle: "Install this part",
        installHint:
            "This opens the visit form pre-filled. The timer and cost land the moment you save.",

        /** Row copy */
        installedBadge: "Installed",
        onHandBadge: "On shelf",
        boughtOn: "Bought {date}",
        edit: "Edit",
        remove: "Remove",
        /** Overflow (⋯) menu button label. */
        moreOptions: "More options",
        removeTitle: "Remove from shelf",
        removeConfirm:
            "Remove {label}? It hasn't been installed.",
        removeYes: "Remove",
    },
    /** Spend dashboard [S1–S3, D1] */
    spend: {
        /** Car page: the car's own total and by-type breakdown. [S1] */
        carTitle: "Spending",
        installedCostNote: "Shelf parts count as spending on the day they’re installed.",
        allTime: "All time",
        breakdownTitle: "By service",
        /** Fallback label for a "custom" spend row when no preset matches. */
        customBucket: "Custom",
        /**
         * The breakdown is summed from the history the page has LOADED, while
         * the figure above it is the car's stored total — so a car with more
         * entries than one page has to say so rather than quietly disagree.
         */
        partialNote:
            "Breakdown covers the {count} shown below. Load older entries to include the rest.",

        /** Group page: all-time across the group's cars, then per car. [S1] */
        groupTitle: "Spending",
        groupAllTime: "All time, across these cars",
        groupEmpty: "Nothing has been logged against these cars yet.",

        /** Home strip. [S2, D1] */
        stripYear: "Spent in {year}",
        /** Home Zone B label — year is implicit ("this year"). [Home polish] */
        stripYearShort: "Spent this year",

        /** Counts, so a sentence never reads "1 cars". */
        carCount: "{count} car",
        carCountPlural: "{count} cars",
        entryCount: "{count} entry",
        entryCountPlural: "{count} entries",

        /**
         * Recalculate: the self-heal for every denormalised counter here.
         * Owner-only, tucked behind a menu — it repairs drift, it isn't
         * something anyone should feel invited to press.
         */
        menuLabel: "Spending options",
        recalculate: "Fix totals",
        recalculateBody:
            "Re-reads every service entry in this group and rewrites the totals from them. Only worth doing if a number looks wrong — it reads a lot more than a normal screen does.",
        recalculateConfirm: "Yes, fix them",
        recalculateCancel: "Cancel",
        recalculateWorking: "Fixing…",
        /** Confirm-then-recalculate wrapper used by Manage group's quiet Fix
            totals link. The recalc function itself is untouched — this
            wraps its trigger only. */
        recalculateConfirmTitle: "Fix totals",
        recalculateConfirmBody:
            "This re-checks every service entry and corrects the totals. It's safe, but takes a moment.",
        recalculateClean: "Checked {cars} and {entries} — everything already agreed.",
        recalculateFixed:
            "Fixed {corrected} totals across {cars} and {entries}.",
        recalculateTooMany:
            "This group has more history than Fix totals reads in one pass. Nothing was changed — tell the developer.",
    },
    /**
     * Account menu. Sign-out moved in here from the top bar, where it sat one
     * mis-tap away from the notification bell.
     */
    account: {
        menuLabel: "Account",
        signedInAs: "Signed in as",
        settings: "Settings",
    },
    /** Settings [SET1, SET2, D2] */
    settings: {
        title: "Settings",
        back: "Back",
        /** Muted section labels in the Settings card [three-section polish]. */
        sectionProfile: "Profile",
        sectionAccount: "Account",
        sectionPreferences: "Preferences",
        nameLabel: "Display name",
        namePlaceholder: "Your name",
        /** Resting-state helper. The 3–20 rule is intentionally NOT here — it
            surfaces only in the error state, so the field doesn't recite rules
            the user hasn't broken yet. See errors.invalidUsername. */
        nameHint: "This is the name people in your groups see.",
        nameSave: "Save",
        nameCancel: "Cancel",
        nameSaved: "Name saved.",
        /** Compact inline confirmation next to the field label, shown briefly
            after a successful rename before fading. The full-sentence
            `nameSaved` above still drives the app-wide toast. */
        nameSavedInline: "Saved",
        emailLabel: "Email",
        emailHint: "This is the email you sign in with.",
        signOut: "Sign out",
        /** Language selector [T19, I18N1]. Applies immediately, no reload. */
        languageLabel: "Language",
        languageHint: "Changes to buttons, menus and messages — never to your car names or notes.",
        languageEn: "English",
        languageMs: "Bahasa Melayu",
        languageZh: "中文 (Simplified)",
        languageSaved: "Language saved.",
    },
    /** Notifications [N1-N5] */
    notifications: {
        title: "Notifications",
        bellLabel: "Notifications",
        bellWithCount: "Notifications, {count} unread",
        markAllRead: "Mark all read",
        /** Select-mode entry / exit / bulk-delete strings. */
        selectStart: "Select",
        selectCancel: "Cancel",
        selectAll: "Select all",
        deselectAll: "Deselect all",
        /** "Delete (n)" — count is the number ticked. */
        deleteCount: "Delete ({count})",
        /** ConfirmDialog copy. */
        deleteTitle: "Delete notifications?",
        deletePrompt: "This will delete {count} notifications.",
        deletePromptOne: "This will delete this notification.",
        deleteConfirm: "Delete {count}",
        deleteConfirmOne: "Delete",
        deleting: "Deleting…",
        emptyTitle: "No notifications yet",
        emptyBody:
            "When someone asks to join one of your groups, or an owner answers your request, it'll show up here.",
        loadMore: "Load older",
        loading: "Loading notifications…",
        // One line per type — the {name} placeholders are filled from payload.
        joinRequest: "{username} wants to join {group}",
        requestAccepted: "You're in! Your request to join {group} was accepted",
        requestDeclined: "Your request to join {group} was declined",
        removedFromGroup: "You were removed from {group}",
        /**
         * [G12] Names are point-in-time: this keeps the names the rename
         * actually happened between, even if the group is renamed again later.
         */
        groupRenamed: "{username} renamed {old} to {new}",
        /** [R4] */
        dueSoon: "{type} on {car} is due soon — {due}",
        overdue: "{type} on {car} is overdue — {due}",
        /** [N6] One type, two wordings — the shape is identical. */
        accessGranted: "You can now edit {car} in {group}",
        accessRevoked: "Your edit access to {car} in {group} was removed",
        /**
         * [T15] A type this build doesn't recognise — an old tab still open
         * across a deploy that added one. Says the only thing still known to
         * be true rather than guessing at a wording.
         */
        unknown: "Something happened in {group}",
    },
    /** Member management [G8, G9, G10] */
    members: {
        title: "Members",
        manageTitle: "Manage members",
        columnMember: "Member",
        ownerBadge: "Owner",
        memberBadge: "Member",
        joinedOn: "Joined {date}",
        remove: "Remove",
        /** Bottom-right button INSIDE a member's expanded panel — reads
            "Remove member" because the row context (member's name in the
            row above) is one level away rather than adjacent. */
        removeMemberAction: "Remove member",
        /** ConfirmDialog title on the remove-member flow. */
        removeTitle: "Remove member",
        removeConfirm: "Remove {name} from this group?",
        /** Stronger confirm used in the People card — names the consequence. */
        removeConfirmStrong:
            "Remove {name} from {group}? They'll lose access to all its cars.",
        removeYes: "Remove",
        cancel: "Cancel",
        removed: "{name} was removed.",
        /** Per-member car-adding toggle, owner-only. [C1] */
        carAdderLabel: "Can add cars to this group",
        carAdderHint: "Owners can always add cars.",
        carAdderGranted: "{name} can add cars now.",
        carAdderRevoked: "{name} can no longer add cars.",

        /** People card [polish, person-centric]. Merges what used to be the
            Members panel and the Access grid. */
        peopleTitle: "People ({count})",
        /** One-line helper. Rewritten in the Members redesign — the previous
            two-clause version was carrying the "here" back-reference that a
            deduped page header no longer supplies. */
        peopleBody:
            "Everyone can see every car. Edit access is set per member.",
        peopleBodyReadOnly:
            "Everyone can see every car. The owner sets edit access per member.",
        /** Non-owner bulk edit toggle. Mixed = some cars on, some off. */
        peopleBulkLabel: "Can edit all cars",
        peopleBulkMixed: "Custom",
        /** Post-redesign wording — there is no disclosure to expand any
            more, the per-car list sits directly below the bulk toggle. */
        peopleBulkHint: "Some cars on, some off.",
        /** Small uppercase section label above the per-car list inside a
            member's expanded panel. No collapsible any more; the list
            renders directly. */
        perCarSectionLabel: "Per-car edit access",
        /** Empty-list line under the per-car section. */
        peopleNoCars: "No cars in this group yet.",
        /** Rendered when the viewer is the only member. Owner-only nudge. */
        peopleAloneNudge:
            "When people join, you'll choose who can edit each car.",
        peopleAloneInvite: "Invite people",

        leaveTitle: "Leave this group",
        leaveBody: "You'll lose access to it and anything shared inside it.",
        leaveButton: "Leave group",
        leaveConfirm: "Leave this group? You'll need a new invite to come back.",
        leaveYes: "Yes, leave",
        left: "You left {name}.",
        ownerCannotLeave:
            "You own this group, so you can't leave it. Delete it below if you're done with it.",
    },
    common: {
        loading: "Loading Application...",
        processing: "Processing...",
        offline: "You’re offline. Reconnect to save service and mileage changes.",
        connectionRequired: "Reconnect to the internet and try again.",
        /** Fallback for the destination-labelled back link while the target's
            own name is still loading. */
        back: "Back",
        /** The home destination — used as the back-link label from screens
            that return to the signed-in landing page. */
        home: "Home",
        /** aria-label for the header logo + name link. */
        homeLinkAria: "Journey Care — home",
    },
    errors: {
        required: "This field is required.",
        invalidEmail: "Invalid email address.",
        weakPassword: "Must be 8+ characters and include a number.",
        invalidUsername: "Please use between 3 and 20 characters.",
        passwordMismatch: "Passwords do not match.",
        groupNameTooLong: "Please use 50 characters or fewer.",
        carTextTooLong: "Please use 40 characters or fewer.",
        plateTooLong: "Please use 20 characters or fewer.",
        odometerInvalid: "Enter the mileage in whole kilometres.",
        costInvalid: "Enter the cost as a number, like 250 or 250.50.",
        dateFuture: "A service can't be dated in the future.",
        intervalInvalid: "Enter a whole number, or leave it blank.",
        /** Debounced access toggles: on a rejected settled write, the
            optimistic switch reverts and this one-line toast fires (kind-
            deduped so a rapid burst never stacks). Deliberately generic —
            the specific reason (offline, permission-denied) is logged, but
            the user only needs the actionable half. */
        accessToggleFailed: "Couldn't update access. Try again.",
    },
};

/** Shape every locale file must satisfy. */
export type Locale = typeof strings;
