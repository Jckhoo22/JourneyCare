/**
 * Universal Email Regex
 * Checks for: standard chars + @ + domain name + . + extension (2+ chars)
 */
export const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

/**
 * Password Regex
 * Requirement: Minimum 8 characters, at least 1 number.
 * Explanation:
 * ^          : Start of string
 * (?=.*\d)   : Positive lookahead - must contain at least 1 digit
 * .          : Any character
 * {8,}       : Occurring 8 or more times
 * $          : End of string
 */
export const PASSWORD_REGEX = /^(?=.*\d).{8,}$/;

/**
 * Username bounds, measured on the trimmed value. [A6]
 *
 * Deliberately a length check rather than a character-class regex: usernames
 * are display names people choose for themselves, and a Latin-only pattern
 * would reject perfectly ordinary names — accented, non-Latin, or carrying an
 * apostrophe. Nothing downstream parses this field, so length is the only
 * constraint worth enforcing.
 */
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 20;

export const isValidUsername = (value: string): boolean => {
    const trimmed = value.trim();
    return (
        trimmed.length >= USERNAME_MIN_LENGTH &&
        trimmed.length <= USERNAME_MAX_LENGTH
    );
};

/**
 * Group name bounds, measured on the trimmed value. [G1]
 * Mirrored in firestore.rules — keep the two in step.
 */
export const GROUP_NAME_MIN_LENGTH = 1;
export const GROUP_NAME_MAX_LENGTH = 50;

export const isValidGroupName = (value: string): boolean => {
    const trimmed = value.trim();
    return (
        trimmed.length >= GROUP_NAME_MIN_LENGTH &&
        trimmed.length <= GROUP_NAME_MAX_LENGTH
    );
};

/**
 * Car field bounds. [C2, C3]
 * Every one of these is mirrored in firestore.rules § cars — keep the two in
 * step, and remember the rules are the enforcement; these only decide what the
 * form complains about before it tries.
 */
export const CAR_TEXT_MAX_LENGTH = 40;
export const CAR_PLATE_MAX_LENGTH = 20;
export const CAR_YEAR_MIN = 1950;
/** Generous upper bound — a rules ceiling, not a realistic model year. */
export const CAR_YEAR_MAX = 2100;
/** 10 million km. Nothing on the road gets here; it stops a fat-fingered zero. */
export const CAR_ODOMETER_MAX = 10000000;

/** Brand and model are required and bounded; both are free text under "Other". */
export const isValidCarText = (value: string): boolean => {
    const trimmed = value.trim();
    return trimmed.length > 0 && trimmed.length <= CAR_TEXT_MAX_LENGTH;
};

export const isValidCarYear = (year: number): boolean =>
    Number.isInteger(year) && year >= CAR_YEAR_MIN && year <= CAR_YEAR_MAX;

/**
 * Odometer is optional; when given it must be a non-negative whole number of
 * kilometres. Empty is valid — plenty of people won't know it offhand. [C3]
 */
export const isValidOdometer = (value: number): boolean =>
    Number.isInteger(value) && value >= 0 && value <= CAR_ODOMETER_MAX;
