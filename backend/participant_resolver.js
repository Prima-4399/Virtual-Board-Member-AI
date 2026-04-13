const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const BOARD_ROLE_LABELS = {
    board_chair: 'Board Chair',
    director: 'Director',
    company_secretary: 'Company Secretary',
    legal_compliance: 'Legal & Compliance',
    ceo_exec: 'CEO/Executive'
};

function formatRole(role) {
    return BOARD_ROLE_LABELS[role] || role;
}

/**
 * Normalize a string for comparison: lowercase, trim, remove extra spaces
 */
function normalize(str) {
    return (str || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Multi-tier matching of a Recall.ai participant name to org member profiles.
 * Returns the matched profile or null.
 */
function findMatch(participantName, members) {
    const name = normalize(participantName);
    if (!name) return null;

    // Tier 1: Exact match on display_name
    for (const m of members) {
        if (m.display_name && normalize(m.display_name) === name) return m;
    }

    // Tier 2: Exact match on username
    for (const m of members) {
        if (m.username && normalize(m.username) === name) return m;
    }

    // Tier 3: Email prefix match (before @)
    for (const m of members) {
        if (m.email) {
            const prefix = normalize(m.email.split('@')[0]);
            if (prefix === name) return m;
        }
    }

    // Tier 4: Substring containment (handles "Dr. Jane Smith" <-> "Jane Smith")
    for (const m of members) {
        const displayNorm = normalize(m.display_name || '');
        const usernameNorm = normalize(m.username || '');

        if (displayNorm && (name.includes(displayNorm) || displayNorm.includes(name))) return m;
        if (usernameNorm && (name.includes(usernameNorm) || usernameNorm.includes(name))) return m;
    }

    return null;
}

/**
 * Resolve Recall.ai transcript participants to registered org members.
 *
 * @param {Array} transcriptSegments - Raw Recall.ai transcript data
 * @param {string} organizationId - The org to match against
 * @returns {Array} Resolved attendees: { participant_name, profile_id, board_role, matched, speaking_segments }
 */
async function resolveParticipants(transcriptSegments, organizationId) {
    // 1. Fetch all org members
    const { data: members, error } = await supabase
        .from('profiles')
        .select('id, email, username, display_name, board_role')
        .eq('organization_id', organizationId);

    if (error) {
        console.error('[RESOLVER] Failed to fetch org members:', error.message);
        return [];
    }

    // 2. Count speaking segments per unique participant name
    const segmentCounts = {};
    for (const segment of transcriptSegments) {
        const name = segment.participant?.name || 'Unknown';
        segmentCounts[name] = (segmentCounts[name] || 0) + 1;
    }

    // 3. Match each unique participant
    const attendees = [];
    for (const [participantName, segments] of Object.entries(segmentCounts)) {
        const match = findMatch(participantName, members || []);

        attendees.push({
            participant_name: participantName,
            profile_id: match ? match.id : null,
            board_role: match ? match.board_role : null,
            matched: !!match,
            speaking_segments: segments
        });
    }

    return attendees;
}

/**
 * Persist resolved attendees to the meeting_attendees table and update meetings.attendees_summary.
 */
async function persistAttendees(meetingId, attendees) {
    // Upsert each attendee
    for (const a of attendees) {
        const { error } = await supabase
            .from('meeting_attendees')
            .upsert({
                meeting_id: meetingId,
                profile_id: a.profile_id,
                participant_name: a.participant_name,
                board_role: a.board_role,
                matched: a.matched,
                speaking_segments: a.speaking_segments
            }, { onConflict: 'meeting_id,participant_name' });

        if (error) {
            console.error(`[RESOLVER] Failed to upsert attendee "${a.participant_name}":`, error.message);
        }
    }

    // Build and store denormalized summary
    const summary = attendees.map(a => ({
        name: a.participant_name,
        board_role: a.board_role ? formatRole(a.board_role) : null,
        board_role_key: a.board_role,
        matched: a.matched,
        segments: a.speaking_segments
    }));

    const { error: sumError } = await supabase
        .from('meetings')
        .update({ attendees_summary: summary })
        .eq('id', meetingId);

    if (sumError) {
        console.error('[RESOLVER] Failed to update attendees_summary:', sumError.message);
    }

    return summary;
}

module.exports = {
    resolveParticipants,
    persistAttendees,
    formatRole,
    BOARD_ROLE_LABELS
};
