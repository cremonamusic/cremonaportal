// ── Shared month-grid renderer for the schedule pages ───────────────────────
// Returns HTML for a month calendar. The caller supplies day sessions and a
// chip() styler, and binds its own click handlers afterwards:
//   .cal-day-jump [data-date]  → jump to that day (day view)
//   chip attrs                 → whatever the page's block click expects
window.cremonaMonthGrid = function (opts) {
  var anchor = opts.anchor, C = opts.C;
  var y = anchor.getFullYear(), m = anchor.getMonth();
  var today = new Date();
  var first = new Date(y, m, 1);
  var startDow = (first.getDay() + 6) % 7; // Monday = 0
  var gridStart = new Date(y, m, 1 - startDow);
  var daysInMonth = new Date(y, m + 1, 0).getDate();
  var weeks = Math.ceil((startDow + daysInMonth) / 7);

  var html = '<div style="display:grid;grid-template-columns:repeat(7,1fr);border-bottom:1px solid ' + C.outerBorder + ';">';
  ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].forEach(function (dn) {
    html += '<div style="padding:8px 6px;text-align:center;font-size:11px;font-weight:700;color:' + C.dayLabel + ';background:' + C.headBg + ';border-left:1px solid ' + C.cellBorder + ';">' + dn + '</div>';
  });
  html += '</div><div style="display:grid;grid-template-columns:repeat(7,1fr);">';

  for (var i = 0; i < weeks * 7; i++) {
    var day = new Date(gridStart);
    day.setDate(gridStart.getDate() + i);
    var inMonth = day.getMonth() === m;
    var isToday = day.toDateString() === today.toDateString();
    var sessions = opts.sessionsForDay(day).slice().sort(function (a, b) {
      return ((a.dateTime && a.dateTime.seconds) || 0) - ((b.dateTime && b.dateTime.seconds) || 0);
    });
    var iso = day.getFullYear() + '-' + String(day.getMonth() + 1).padStart(2, '0') + '-' + String(day.getDate()).padStart(2, '0');

    html += '<div style="min-height:96px;border-left:1px solid ' + C.cellBorder + ';border-bottom:1px solid ' + C.cellBorder + ';padding:4px;' + (inMonth ? '' : 'opacity:.38;') + 'background:' + (isToday ? C.todayCol : 'transparent') + ';">';
    html += '<div class="cal-day-jump" data-date="' + iso + '" title="Open day view" style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;font-size:11px;font-weight:700;cursor:pointer;margin-bottom:2px;background:' + (isToday ? '#3b82f6' : 'transparent') + ';color:' + (isToday ? '#fff' : C.dayNum) + ';">' + day.getDate() + '</div>';

    sessions.slice(0, 3).forEach(function (s) {
      var c = opts.chip(s);
      html += '<div ' + (c.attrs || '') + ' style="font-size:10px;font-weight:600;color:' + c.text + ';background:' + c.bg + ';border-left:2px solid ' + c.border + ';border-radius:3px;padding:1px 4px;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;' + (c.strike ? 'text-decoration:line-through;opacity:.6;' : '') + '">' + c.label + '</div>';
    });
    if (sessions.length > 3) {
      html += '<div class="cal-day-jump" data-date="' + iso + '" style="font-size:10px;font-weight:700;color:' + C.dayLabel + ';cursor:pointer;">+' + (sessions.length - 3) + ' more</div>';
    }
    html += '</div>';
  }
  html += '</div>';
  return html;
};
