const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runMigration() {
    console.log('[MIGRATION] Checking board roles migration status...\n');
    let needsManualSQL = false;

    // Check 1: board_role column on profiles
    console.log('[1/5] Checking profiles.board_role...');
    const { error: e1 } = await supabase.from('profiles').select('board_role').limit(1);
    if (e1 && e1.message.includes('board_role')) {
        console.log('  ✗ board_role column missing');
        needsManualSQL = true;
    } else {
        console.log('  ✓ board_role column exists');
    }

    // Check 2: display_name column on profiles
    console.log('[2/5] Checking profiles.display_name...');
    const { error: e2 } = await supabase.from('profiles').select('display_name').limit(1);
    if (e2 && e2.message.includes('display_name')) {
        console.log('  ✗ display_name column missing');
        needsManualSQL = true;
    } else {
        console.log('  ✓ display_name column exists');
    }

    // Check 3: attendees_summary column on meetings
    console.log('[3/5] Checking meetings.attendees_summary...');
    const { error: e3 } = await supabase.from('meetings').select('attendees_summary').limit(1);
    if (e3 && e3.message.includes('attendees_summary')) {
        console.log('  ✗ attendees_summary column missing');
        needsManualSQL = true;
    } else {
        console.log('  ✓ attendees_summary column exists');
    }

    // Check 4: meeting_attendees table
    console.log('[4/5] Checking meeting_attendees table...');
    const { error: e4 } = await supabase.from('meeting_attendees').select('id').limit(1);
    if (e4) {
        console.log('  ✗ meeting_attendees table missing');
        needsManualSQL = true;
    } else {
        console.log('  ✓ meeting_attendees table exists');
    }

    if (needsManualSQL) {
        console.log('\n══════════════════════════════════════════════════════');
        console.log('  MANUAL ACTION REQUIRED: Run migration SQL');
        console.log('══════════════════════════════════════════════════════');
        console.log('\n1. Open your Supabase SQL Editor:');
        console.log('   https://supabase.com/dashboard/project/diejlteshhrpklvfvvzb/sql/new');
        console.log('\n2. Paste and run the following SQL:\n');

        const sql = require('fs').readFileSync(__dirname + '/migration_board_roles.sql', 'utf8');
        console.log(sql);

        console.log('\n3. After running, re-execute: node run_migration.js');
        return;
    }

    // Step 5: Set org owners to board_chair (can do via supabase-js)
    console.log('[5/5] Setting org owners to Board Chair...');
    const { data: owners } = await supabase
        .from('profiles')
        .select('id')
        .eq('role', 'owner')
        .eq('board_role', 'director');

    if (owners && owners.length > 0) {
        for (const owner of owners) {
            await supabase.from('profiles').update({ board_role: 'board_chair' }).eq('id', owner.id);
        }
        console.log(`  ✓ Updated ${owners.length} owner(s) to Board Chair`);
    } else {
        console.log('  ✓ No owners need updating');
    }

    // Final verification
    console.log('\n[VERIFY] Current profiles:');
    const { data: profiles } = await supabase
        .from('profiles')
        .select('username, email, role, board_role, display_name');

    if (profiles) console.table(profiles);

    console.log('\n✓ Migration complete!');
}

runMigration().catch(err => {
    console.error('[MIGRATION FAILED]', err.message);
});
