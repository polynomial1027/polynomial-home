(() => {
  const $ = selector => document.querySelector(selector);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const chinaDay = value => new Date(new Date(value).getTime() + 8 * 3600_000).toISOString().slice(0, 10);
  let today = chinaDay(new Date());
  let snapshot, month = today.slice(0, 7), selected = today, initialized = false, openedToday = false;
  const dateLabel = value => new Date(`${value}T00:00:00+08:00`).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai', month: 'long', day: 'numeric', weekday: 'long' });
  const timeLabel = value => new Date(value).toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit' });

  function renderCalendar() {
    if (!snapshot) return;
    const [year, number] = month.split('-').map(Number), first = new Date(Date.UTC(year, number - 1, 1));
    const leading = (first.getUTCDay() + 6) % 7, count = new Date(Date.UTC(year, number, 0)).getUTCDate();
    $('#calendarMonth').textContent = `${year} 年 ${number} 月`;
    $('#calendarGrid').innerHTML = Array.from({ length: leading + count + ((7 - (leading + count) % 7) % 7) }, (_, index) => {
      const date = new Date(Date.UTC(year, number - 1, index - leading + 1));
      const day = date.toISOString().slice(0, 10), items = snapshot.planner.filter(item => item.dueAt && chinaDay(item.dueAt) === day);
      return `<button type="button" role="gridcell" data-day="${day}" aria-label="${day}，${items.length} 项日程" class="${day.slice(0, 7) !== month ? 'outside ' : ''}${day === today ? 'today ' : ''}${day === selected ? 'selected ' : ''}${items.length ? 'has-items ' : ''}${items.length && items.every(item => item.scheduled === false) ? 'paused' : ''}">${date.getUTCDate()}</button>`;
    }).join('');
    $('#calendarGrid').querySelectorAll('[data-day]').forEach(button => button.onclick = () => { selected = button.dataset.day; month = selected.slice(0, 7); renderCalendar(); });
    const items = snapshot.planner.filter(item => item.dueAt && chinaDay(item.dueAt) === selected);
    $('#calendarDetails').innerHTML = `<strong>${escape(dateLabel(selected))}</strong>${items.length ? items.map(item => `<div>${escape(item.title)} <small>${timeLabel(item.dueAt)} · ${item.done ? '已完成' : item.scheduled === false ? '已暂停' : item.source === 'assistant' ? 'AI 安排' : '待办'}</small></div>`).join('') : '<span class="brief-empty">当天没有安排</span>'}`;
  }

  function renderBrief() {
    if (!snapshot) return;
    const brief = snapshot.brief;
    $('#dailyBriefDate').textContent = `${brief.day} 回顾 · ${brief.tomorrow} 安排`;
    $('#briefCompleted').innerHTML = brief.completed.length ? brief.completed.map(item => `<div class="brief-row">✓ ${escape(item.title)}</div>`).join('') : '<div class="brief-empty">今天还没有标记完成的任务。</div>';
    $('#briefTomorrow').innerHTML = brief.tomorrowItems.length ? brief.tomorrowItems.map(item => `<div class="brief-row"><label><input type="checkbox" data-brief-task="${item.id}" ${item.scheduled === false ? '' : 'checked'}><span>${escape(item.title)}<small>${timeLabel(item.dueAt)} · ${item.source === 'assistant' ? 'AI 安排' : '个人计划'}</small></span></label></div>`).join('') : '<div class="brief-empty">明天暂无定时事项。可在聊天框让助手安排，也可手动添加。</div>';
    $('#briefServerSection').hidden = snapshot.user.role !== 'admin';
    if (snapshot.user.role === 'admin') {
      const report = brief.report, review = brief.review;
      const frequency = snapshot.assistant.reviewFrequency;
      $('#briefServer').innerHTML = `<div class="brief-row">基础检查：${report ? escape(report.notes || report.severity) : '今日报告准备中'}</div><div class="brief-row">AI 巡检：${review ? `${escape(review.day)} · ${escape(review.status === 'completed' ? review.summary : review.error || '运行中')}` : frequency === 'off' ? '自动巡检已关闭；可在管理区设置每天或每周' : `按${frequency === 'weekly' ? '每周' : '每天'}计划在空闲时段运行；此处显示本次已完成的记录`}</div>`;
    }
  }

  async function markSeen() {
    if (!snapshot || snapshot.brief.seen) return;
    try { await request('/api/workspace/brief/seen', { method: 'POST' }); snapshot.brief.seen = true; }
    catch (error) { $('#briefNotice').textContent = error.message; }
  }

  function open() { renderBrief(); $('#briefNotice').textContent = ''; if (!$('#dailyBriefDialog').open) $('#dailyBriefDialog').showModal(); openedToday = true; }
  function init() {
    if (initialized) return;
    initialized = true;
    $('#openDailyBrief').onclick = open;
    $('#briefClose').onclick = () => $('#dailyBriefDialog').close();
    $('#dailyBriefDialog').addEventListener('close', () => { markSeen(); });
    $('#briefSave').onclick = async () => {
      const button = $('#briefSave'); button.disabled = true; $('#briefNotice').textContent = '保存中…';
      try {
        for (const input of $('#briefTomorrow').querySelectorAll('[data-brief-task]')) {
          const item = snapshot.planner.find(row => row.id === input.dataset.briefTask);
          if (item && (item.scheduled !== false) !== input.checked) {
            await request(`/api/workspace/planner/${item.id}`, { method: 'PATCH', body: JSON.stringify({ scheduled: input.checked }) });
            item.scheduled = input.checked;
          }
        }
        await markSeen();
        $('#dailyBriefDialog').close();
        renderCalendar();
        window.dispatchEvent(new Event('workspace:refresh'));
      } catch (error) { $('#briefNotice').textContent = error.message; }
      finally { button.disabled = false; }
    };
    for (const [selector, delta] of [['#calendarPrev', -1], ['#calendarNext', 1]]) $(selector).onclick = () => {
      const [year, number] = month.split('-').map(Number), date = new Date(Date.UTC(year, number - 1 + delta, 1));
      month = date.toISOString().slice(0, 7); selected = `${month}-01`; renderCalendar();
    };
  }
  window.DailyWorkspace = { render(data) { init(); const currentDay = chinaDay(new Date()); if (currentDay !== today) { today = currentDay; openedToday = false; month = today.slice(0, 7); selected = today; } snapshot = data; renderCalendar(); if (!openedToday && !data.brief.seen) open(); } };
})();
