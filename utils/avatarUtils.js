/**
 * Set of consistent, aesthetically pleasing colors for avatar placeholders.
 * Material Design colors (500 weight) for good contrast with white text.
 */
const AVATAR_COLORS = [
    '#f44336', // Red
    '#E91E63', // Pink
    '#9C27B0', // Purple
    '#673AB7', // Deep Purple
    '#3F51B5', // Indigo
    '#2196F3', // Blue
    '#03A9F4', // Light Blue
    '#00BCD4', // Cyan
    '#009688', // Teal
    '#4CAF50', // Green
    '#8BC34A', // Light Green
    '#CDDC39', // Lime
    '#FFC107', // Amber
    '#FF9800', // Orange
    '#FF5722', // Deep Orange
    '#795548', // Brown
];

/**
 * Generates a deterministic background color for an avatar placeholder
 * based on the user's identifier (UID or name).
 * 
 * @param {string} identifier - User's UID or name
 * @returns {string} Hex color code
 */
export const getAvatarColor = (identifier) => {
    if (!identifier || typeof identifier !== 'string') return AVATAR_COLORS[5]; // Default Blue

    let hash = 0;
    for (let i = 0; i < identifier.length; i++) {
        hash = identifier.charCodeAt(i) + ((hash << 5) - hash);
    }

    const index = Math.abs(hash) % AVATAR_COLORS.length;
    return AVATAR_COLORS[index];
};
