const systemAnnouncementsEn = {
  'update-v6': ['Chat, Game Save, and Administration Update', 'Added account game saves, release notes, paginated chat administration, sensitive-word controls, and additional server settings.'],
  'game-match3-v1': ['Game 01: Starpath Match Is Available', 'Added the complete match-three game with level goals, move limits, chain scoring, hints, pause controls, and account-based progress.'],
  'navigation-v1': ['Unified Site Navigation', 'Standardized site navigation, current-page highlighting, breadcrumbs, and return links across the portal.'],
  'drive-learning-v1': ['File Drive, Account Permissions, and Learning', 'Added private and public drives, file sharing, drive attachments, administration, detailed permissions, and account-based Python learning progress.'],
  'python-notebook-v1': ['Python Lab Is Available', 'Added account-isolated JupyterLab environments with configurable permissions, concurrency, memory, CPU, storage quota, and idle shutdown.'],
  'admin-drive-filename-v1': ['Administration, Drive Layout, and Filename Update', 'Reorganized administration settings, redesigned the drive interface, and fixed Chinese filename encoding in drive and chat uploads.'],
  'learning-lab-v1': ['Python Courses, Labs, and Assignment Grading', 'Integrated Python labs into Learning with runnable examples, randomized assignment grading, runtime and memory records, and optional public results.'],
  'footer-assignment-v1': ['Site Footer and Assignment Workflow Update', 'Added a global footer and version label, completed the contact section, and introduced dedicated assignment editors, drafts, visible tests, and private randomized submissions.'],
  'solution-public-results-v1': ['Solution Format and Public Results Update', 'Standardized assignments on class Solution methods and added examples plus a community-results viewer for voluntarily shared solutions.'],
  'assignment-actual-result-v1': ['Assignment Results and Record Management Fix', 'Visible tests now show actual and expected values. Users can reset code, clear their records, and change visibility; administrators can remove public solutions.'],
  'course-curriculum-v2': ['Complete Python Foundations Curriculum', 'Expanded Learning to 11 chapters, 64 lessons, 129 independently runnable examples, and 15 randomized assignments while preserving existing progress and drafts.'],
  'draft-navigation-admin-v1': ['Draft Library, App Navigation, and Release-note Management', 'Added a personal draft library with export, grouped site applications under Apps, and made release-note administration collapsible and searchable.'],
  'learning-layout-v012': ['0.1.2 · Course Selection and Learning Layout', 'Added course selection cards and restored the three-column Python layout: contents on the left, lessons and assignments in the center, and the code lab on the right.'],
  'site-language-v013': ['0.1.3 · Site-wide Chinese and English Support', 'Added a shared language selector to the upper-right corner of the portal. Navigation, pages, administration, drive, games, system messages, Python curriculum, assignment instructions, code comments, and grading output now follow the selected language. User messages, filenames, names, notes, drafts, and other user-authored content remain unchanged.'],
  'draft-delete-v014': ['0.1.4 · Assignment Draft and Chat Naming Patch', 'Users can now delete their own saved assignment drafts individually. A planned-improvements label has been added beside course notes, and the site-wide chat label now consistently uses Chat.'],
  'python-object-memory-v015': ['0.1.5 · Python Object Memory Primer and Chat Layout Fix', 'Added a textbook-style names, references, and object identity prerequisite to Chapter 1. Restored the chat composer to the full main-column width, constrained message history to its own scrollable region, and prevented long text, filenames, and attachments from overflowing the chat panel or footer. The bilingual course now contains 65 lessons and 140 independently runnable examples.']
};

function localizeAnnouncement(item, language) {
  if (language !== 'en') return item;
  const translated = systemAnnouncementsEn[item.id];
  if (translated) return { ...item, title: translated[0], content: translated[1], originalTitle: item.title, originalContent: item.content };
  return { ...item, title: 'Administrator Release Note', content: 'This administrator-authored release note is currently available in its original language.', originalTitle: item.title, originalContent: item.content };
}

module.exports = { localizeAnnouncement };
