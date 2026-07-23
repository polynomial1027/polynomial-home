(() => {
  const directory = document.querySelector('#adminDirectoryLinks');
  if (!directory) return;

  const groups = [
    {
      id: 'admin-accounts',
      title: '账号管理',
      eyebrow: 'Accounts',
      description: '创建账号与管理已有用户',
      nodes: [...document.querySelectorAll('.admin-layout > *')]
    },
    { id: 'admin-announcements', title: '更新公告管理', node: document.querySelector('.announcement-manager') },
    { id: 'admin-settings', title: '功能参数设置', node: document.querySelector('#settingsForm') },
    { id: 'admin-notebooks', title: '课程代码环境状态', heading: '课程代码环境状态' },
    { id: 'admin-chat-records', title: '聊天记录管理', node: document.querySelector('.chat-record-manager') },
    { id: 'admin-drive', title: '网盘总览', heading: '网盘总览' },
    { id: 'admin-activity', title: '用户状态与操作记录', heading: '用户状态与操作记录' },
    { id: 'admin-go', title: '围棋预设与引擎', node: document.querySelector('.go-admin-section') },
    { id: 'admin-puzzles', title: '围棋题库', heading: '围棋题库' },
    { id: 'admin-feedback', title: '问题反馈汇总', heading: '问题反馈汇总' }
  ];

  const findByHeading = title => [...document.querySelectorAll('.admin-page > section, .admin-page > form, .admin-page > details')]
    .find(node => node.querySelector('h2')?.textContent.trim() === title);

  const esc = value => String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));

  function createSummary(title, eyebrow, description) {
    const summary = document.createElement('summary');
    summary.className = 'admin-fold-summary';
    summary.innerHTML = `<div><div class="eyebrow">${esc(eyebrow || 'Administration')}</div><h2>${esc(title)}</h2>${description ? `<p>${esc(description)}</p>` : ''}</div><span class="category-arrow" aria-hidden="true">⌄</span>`;
    return summary;
  }

  function convert(group, index) {
    let nodes = group.nodes?.filter(Boolean) || [];
    if (!nodes.length) {
      const node = group.node || findByHeading(group.heading);
      if (node) nodes = [node];
    }
    if (!nodes.length) return null;

    let details;
    if (nodes.length === 1 && nodes[0].tagName === 'DETAILS') {
      details = nodes[0];
      details.id = group.id;
      details.classList.add('admin-fold');
      details.querySelector(':scope > summary')?.classList.add('admin-fold-summary');
    } else {
      details = document.createElement('details');
      details.id = group.id;
      details.className = 'panel admin-section admin-fold';
      const first = nodes[0];
      first.before(details);
      details.append(createSummary(group.title, group.eyebrow, group.description));
      const body = document.createElement('div');
      body.className = 'admin-fold-body';
      nodes.forEach(node => {
        node.classList.remove('panel', 'admin-section');
        body.append(node);
      });
      details.append(body);
    }
    details.open = index === 0;
    return details;
  }

  const sections = groups.map(convert).filter(Boolean);
  directory.innerHTML = sections.map(section => {
    const group = groups.find(item => item.id === section.id);
    return `<a href="#${section.id}" data-admin-target="${section.id}">${esc(group.title)}</a>`;
  }).join('');

  function openAndFocus(id, updateHash = true) {
    const target = document.getElementById(id);
    if (!target) return;
    target.open = true;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    target.classList.remove('admin-fold-highlight');
    requestAnimationFrame(() => target.classList.add('admin-fold-highlight'));
    window.setTimeout(() => target.classList.remove('admin-fold-highlight'), 1300);
    if (updateHash) history.replaceState(null, '', `#${id}`);
  }

  directory.addEventListener('click', event => {
    const link = event.target.closest('[data-admin-target]');
    if (!link) return;
    event.preventDefault();
    openAndFocus(link.dataset.adminTarget);
  });

  document.querySelector('#collapseAdminSections')?.addEventListener('click', () => {
    sections.forEach(section => { section.open = false; });
    document.querySelector('#adminDirectory')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    history.replaceState(null, '', location.pathname + location.search);
  });

  if (location.hash.startsWith('#admin-')) {
    window.setTimeout(() => openAndFocus(location.hash.slice(1), false), 0);
  }
  window.I18N?.translateElement(document.querySelector('#adminDirectory'));
  document.querySelectorAll('.admin-fold-summary').forEach(summary => window.I18N?.translateElement(summary));
})();
