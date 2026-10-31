
/* ========================================
   共通処理・初期設定
======================================== */

const $ = id => document.getElementById(id);

const todayISO = () => {
    const d = new Date();

    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

let data = JSON.parse(localStorage.getItem('tsumilog_v2') || 'null') || {
    activities: [],
    records: [],
    settings: {
        hourlyRate: 1200,
        nightPremium: 25,
        nightStart: '22:00',
        nightEnd: '05:00',
        overtimePremium: 25,
        overtimeAfter: 8,
        transport: 0,
        defaultBreakMinutes: 60,
        workColor: '#29966a'
    }
};

if (data.settings.defaultBreakMinutes === undefined) {
    data.settings.defaultBreakMinutes = 60;
}

if (data.settings.workColor === undefined) {
    data.settings.workColor = '#29966a';
}

let viewDate = new Date();
let selectedDate = null;
let editingId = null;
let editingActivityId = null;


/* ========================================
   保存・表示用共通関数
======================================== */

function persist() {
    localStorage.setItem('tsumilog_v2', JSON.stringify(data));
}

function money(n) {
    return '¥' + Math.round(n).toLocaleString('ja-JP');
}

function fmt(n) {
    return Number(n.toFixed(2)).toLocaleString('ja-JP');
}

function formatDuration(minutes) {
    const total = Math.round(minutes);
    const hours = Math.floor(total / 60);
    const mins = total % 60;

    if (hours === 0) return `${mins}分`;
    if (mins === 0) return `${hours}時間`;

    return `${hours}時間${mins}分`;
}

function mins(t) {
    const [h, m] = t.split(':').map(Number);

    return h * 60 + m;
}

function overlap(a, b, c, d) {
    return Math.max(0, Math.min(b, d) - Math.max(a, c));
}

function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[c]));
}

function openModal(id) {
    $(id).classList.add('open');
}

function closeModal(id) {
    $(id).classList.remove('open');
}

function monthBounds(d) {
    return {
        start: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`,
        end: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()).padStart(2, '0')}`
    };
}


/* ========================================
   給与計算
======================================== */

function calculateWork(r) {
    const s = mins(r.start);
    const e0 = mins(r.end);
    const e = e0 <= s ? e0 + 1440 : e0;

    const gross = e - s;
    const br = Math.max(0, Number(r.breakMinutes) || 0);
    const net = Math.max(0, gross - br);

    const ns = mins(data.settings.nightStart);
    const ne = mins(data.settings.nightEnd);

    let night = 0;

    // 勤務区間を分単位で深夜帯と重ねる（翌日を含む）
    for (let day = -1; day <= 2; day++) {
        let a = day * 1440 + ns;
        let b = day * 1440 + ne;

        if (ne <= ns) {
            b += 1440;
        }

        night += overlap(s, e, a, b);
    }

    night = Math.min(net, night);

    // 休憩は勤務時間帯に比例配分した概算
    const normal = Math.max(0, net - night);

    const overtime = Math.max(
        0,
        net - Math.max(0, Number(data.settings.overtimeAfter) || 0) * 60
    );

    const base = Number(data.settings.hourlyRate) || 0;
    const np = (Number(data.settings.nightPremium) || 0) / 100;
    const op = (Number(data.settings.overtimePremium) || 0) / 100;

    // 深夜割増と残業割増は重複時に加算
    const overtimeNight = Math.max(
        0,
        overtime - Math.max(
            0,
            normal - (Number(data.settings.overtimeAfter) || 0) * 60
        )
    );

    // 通常賃金＋深夜割増分＋残業割増分＋交通費
    const pay =
        (net / 60) * base +
        (night / 60) * base * np +
        (overtime / 60) * base * op +
        (Number(data.settings.transport) || 0);

    return {
        gross,
        net,
        night,
        normal,
        overtime,
        pay
    };
}


/* ========================================
   全体描画
======================================== */

function render() {
    const bounds = monthBounds(viewDate);

    const monthRecords = data.records.filter(
        r => r.date >= bounds.start && r.date <= bounds.end
    );

    $('monthLabel').textContent =
        `${viewDate.getFullYear()}年${viewDate.getMonth() + 1}月`;

    renderCalendar(monthRecords);
    renderTotals(monthRecords);
    renderRecords(monthRecords);
    renderPay(monthRecords);
    renderActivityManagement();
}


/* ========================================
   カレンダー描画
======================================== */

function renderCalendar(monthRecords) {
    const cal = $('calendar');

    cal.innerHTML = '';

    ['日', '月', '火', '水', '木', '金', '土'].forEach(x => {
        const d = document.createElement('div');

        d.className = 'weekday';
        d.textContent = x;

        cal.append(d);
    });

    const first = new Date(
        viewDate.getFullYear(),
        viewDate.getMonth(),
        1
    );

    const start = new Date(first);
    start.setDate(1 - first.getDay());

    for (let i = 0; i < 42; i++) {
        const d = new Date(start);

        d.setDate(start.getDate() + i);

        const iso =
            `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

        const rs = monthRecords.filter(r => r.date === iso);

        const b = document.createElement('button');

        b.className =
            'day' +
            (d.getMonth() !== viewDate.getMonth() ? ' out' : '') +
            (iso === todayISO() ? ' today' : '') +
            (selectedDate === iso ? ' selected' : '');

        b.innerHTML = `
            <span class="num">${d.getDate()}</span>
            <div>
                ${rs.slice(0, 5).map(r => `
                    <i
                        class="dot"
                        style="background:${r.type === 'work'
                ? '#29966a'
                : (data.activities.find(a => a.id === r.activityId)?.color || '#5b8def')}"
                    ></i>
                `).join('')}
            </div>
        `;

        b.addEventListener('click', () => {
            selectedDate = iso;
            render();
        });

        cal.append(b);
    }
}


/* ========================================
   活動別合計
======================================== */

function renderTotals(rs) {
    const el = $('activityTotals');

    el.innerHTML = '';

    data.activities.forEach(a => {
        const records = rs.filter(
            r => r.type === 'activity' && r.activityId === a.id
        );

        const isTimeUnit =
            a.unit === '時間' || a.unit === '分';

        let total;
        let displayTotal;
        let displayUnit;

        if (isTimeUnit) {
            total = records.reduce((s, r) => {
                const unit = r.unit || a.unit;
                const quantity = Number(r.quantity) || 0;

                return s + (unit === '時間' ? quantity * 60 : quantity);
            }, 0);

            displayTotal = formatDuration(total);
            displayUnit = '今月';
        } else {
            total = records.reduce(
                (s, r) => s + (Number(r.quantity) || 0),
                0
            );

            displayTotal = `${fmt(total)} ${escapeHtml(a.unit)}`;
            displayUnit = `${escapeHtml(a.unit)}・今月`;
        }

        const d = document.createElement('div');

        d.className = 'activity';

        d.innerHTML = `
            <div>
                <span class="dot" style="background:${a.color}"></span>
                <span class="activity-name">${escapeHtml(a.name)}</span>
                <br>
                <small>${displayUnit}</small>
            </div>

            <div class="activity-total">${displayTotal}</div>
        `;

        el.append(d);
    });

    if (!data.activities.length) {
        el.innerHTML = '<div class="empty">活動項目がありません</div>';
    }
}


/* ========================================
   記録一覧
======================================== */

function renderRecords(rs) {
    const filtered = selectedDate
        ? rs.filter(r => r.date === selectedDate)
        : rs;

    $('recordsHeading').textContent = selectedDate
        ? `${selectedDate} の記録`
        : '記録一覧（今月）';

    const el = $('records');

    el.innerHTML = '';

    [...filtered]
        .sort((a, b) => b.date.localeCompare(a.date))
        .forEach(r => {
            const a = data.activities.find(x => x.id === r.activityId);
            const work = r.type === 'work';
            const v = work ? calculateWork(r) : null;

            const row = document.createElement('div');

            row.className = 'record';

            const title = work
                ? '勤務・給料'
                : (a?.name || '活動（削除済み）');

            const meta = work
                ? `${r.start}〜${r.end} ・休憩 ${r.breakMinutes}分 ・通常 ${fmt((v.net - v.night) / 60)}h / 深夜 ${fmt(v.night / 60)}h`
                : `${fmt(r.quantity)} ${r.unit}${r.memo ? ' ・ ' + r.memo : ''}`;

            row.innerHTML = `
                <div>
                    <div class="record-title">
                        ${escapeHtml(title)}
                        ${work ? '<span class="pill">給与</span>' : ''}
                    </div>

                    <div class="record-meta">
                        ${r.date}　${escapeHtml(meta)}
                    </div>
                </div>

                <div class="record-right">
                    ${work
                    ? money(v.pay)
                    : fmt(r.quantity) + ' ' + escapeHtml(r.unit)}
                    <br>
                    <button class="small" data-edit="${r.id}">編集</button>
                </div>
            `;

            el.append(row);
        });

    if (!filtered.length) {
        el.innerHTML = `
            <div class="empty">
                この期間の記録はありません。<br>
                「記録する」から追加できます。
            </div>
        `;
    }

    el.querySelectorAll('[data-edit]').forEach(b => {
        b.addEventListener('click', () => editRecord(b.dataset.edit));
    });
}


/* ========================================
   給料の集計
======================================== */

function renderPay(rs) {
    const works = rs.filter(r => r.type === 'work');

    const sum = works.reduce(
        (s, r) => s + calculateWork(r).pay,
        0
    );

    const hours = works.reduce(
        (s, r) => s + calculateWork(r).net,
        0
    ) / 60;

    const night = works.reduce(
        (s, r) => s + calculateWork(r).night,
        0
    ) / 60;

    $('paySummary').innerHTML = `
        <div class="activity">
            <div>
                <small>給与見込み合計</small>
                <div class="activity-total">${money(sum)}</div>
            </div>

            <div style="text-align:right">
                <small>勤務回数</small>
                <div class="activity-total">${works.length}回</div>
            </div>
        </div>

        <div class="activity" style="margin-top:8px">
            <div>
                <small>実働時間</small>
                <div class="activity-total">${fmt(hours)}時間</div>
            </div>

            <div style="text-align:right">
                <small>深夜時間</small>
                <div class="activity-total">${fmt(night)}時間</div>
            </div>
        </div>
    `;
}


/* ========================================
   活動項目管理
======================================== */

function renderActivityManagement() {
    const el = $('activityManagement');

    el.innerHTML = '';

    data.activities.forEach(a => {
        const d = document.createElement('div');

        d.className = 'activity';

        d.innerHTML = `
            <div>
                <span class="dot" style="background:${a.color}"></span>
                <strong>${escapeHtml(a.name)}</strong>
                <small> ・ ${escapeHtml(a.unit)}</small>
            </div>

            <div>
                <button class="small" data-edit-activity="${a.id}">編集</button>
                <button class="small danger" data-remove="${a.id}">削除</button>
            </div>
        `;

        el.append(d);
    });

    el.querySelectorAll('[data-edit-activity]').forEach(b => {
        b.addEventListener('click', () => {
            editActivity(b.dataset.editActivity);
        });
    });

    el.querySelectorAll('[data-remove]').forEach(b => {
        b.addEventListener('click', () => {
            if (confirm('この活動項目を削除しますか？過去の記録は残ります。')) {
                data.activities = data.activities.filter(
                    a => a.id !== b.dataset.remove
                );

                persist();
                render();
            }
        });
    });
}


/* ========================================
   記録フォーム
======================================== */

function updateRecordMode() {
    const work = $('recordType').value === 'work';

    $('activityField').style.display = work ? 'none' : 'grid';
    $('quantityField').style.display = work ? 'none' : 'grid';
    $('unitField').style.display = work ? 'none' : 'grid';
    $('memoField').style.display = work ? 'none' : 'grid';

    ['startTime', 'endTime', 'breakMinutes'].forEach(id => {
        $(id).closest('.field').style.display = work ? 'grid' : 'none';
    });

    $('workPreview').style.display = work ? 'block' : 'none';

    $('recordModalTitle').textContent = work
        ? '勤務・給料を記録'
        : '活動を記録';

    if (work) {
        updateWorkPreview();
    }
}

function updateWorkPreview() {
    const r = {
        start: $('startTime').value || '00:00',
        end: $('endTime').value || '00:00',
        breakMinutes: $('breakMinutes').value
    };

    const c = calculateWork(r);

    $('normalHours').textContent = fmt(c.normal / 60) + '時間';
    $('nightHours').textContent = fmt(c.night / 60) + '時間';
    $('overtimeHours').textContent = fmt(c.overtime / 60) + '時間';
    $('workPay').textContent = money(c.pay);
}

function fillActivitySelect() {
    const s = $('activitySelect');

    s.innerHTML = '';

    data.activities.forEach(a => {
        const o = document.createElement('option');

        o.value = a.id;
        o.textContent = a.name;

        s.append(o);
    });

    updateUnitPreview();
}

function updateUnitPreview() {
    const a = data.activities.find(
        x => x.id === $('activitySelect').value
    );

    $('unitPreview').value = a?.unit || '';
    $('quantityLabel').textContent =
        '数量（' + (a?.unit || '') + '）';
}

function openNewRecord() {
    editingId = null;

    $('deleteRecord').style.display = 'none';
    $('recordType').value = 'activity';
    $('recordDate').value = selectedDate || todayISO();
    $('quantity').value = '';
    $('memo').value = '';
    $('startTime').value = '16:00';
    $('endTime').value = '02:00';

    $('breakMinutes').value =
        data.settings.defaultBreakMinutes ?? 60;

    fillActivitySelect();
    updateRecordMode();
    openModal('recordModal');
}

function editRecord(id) {
    const r = data.records.find(
        x => String(x.id) === String(id)
    );

    if (!r) return;

    editingId = id;

    $('deleteRecord').style.display = 'inline-block';
    $('recordDate').value = r.date;

    if (r.type === 'work') {
        $('recordType').value = 'work';
        $('startTime').value = r.start;
        $('endTime').value = r.end;
        $('breakMinutes').value = r.breakMinutes;
    } else {
        $('recordType').value = 'activity';

        fillActivitySelect();

        $('activitySelect').value = r.activityId;
        $('quantity').value = r.quantity;
        $('memo').value = r.memo || '';

        updateUnitPreview();
    }

    updateRecordMode();
    openModal('recordModal');
}


/* ========================================
   記録フォームのイベント
======================================== */

$('recordType').addEventListener('change', updateRecordMode);

$('activitySelect').addEventListener('change', updateUnitPreview);

['startTime', 'endTime', 'breakMinutes'].forEach(id => {
    $(id).addEventListener('input', updateWorkPreview);
});

$('addRecordBtn').onclick = openNewRecord;

$('cancelRecord').onclick = () => {
    closeModal('recordModal');
};

$('saveRecord').onclick = () => {
    const date = $('recordDate').value;

    if (!date) {
        alert('日付を入力してください');
        return;
    }

    let r = {
        id: editingId || String(Date.now()),
        date
    };

    if ($('recordType').value === 'work') {
        r = {
            ...r,
            type: 'work',
            start: $('startTime').value,
            end: $('endTime').value,
            breakMinutes: Math.max(
                0,
                Number($('breakMinutes').value) || 0
            )
        };

        if (!r.start || !r.end) {
            alert('出勤時刻と退勤時刻を入力してください');
            return;
        }

        const gross =
            (mins(r.end) <= mins(r.start)
                ? mins(r.end) + 1440
                : mins(r.end)) - mins(r.start);

        if (r.breakMinutes > gross) {
            alert('休憩時間が勤務時間を超えています');
            return;
        }
    } else {
        const a = data.activities.find(
            x => x.id === $('activitySelect').value
        );

        if (!a) {
            alert('先に活動項目を追加してください');
            return;
        }

        const q = Number($('quantity').value);

        if (!Number.isFinite(q) || q < 0) {
            alert('0以上の数量を入力してください');
            return;
        }

        r = {
            ...r,
            type: 'activity',
            activityId: a.id,
            quantity: q,
            unit: a.unit,
            memo: $('memo').value.trim()
        };
    }

    if (editingId) {
        data.records = data.records.map(
            x => String(x.id) === String(editingId) ? r : x
        );
    } else {
        data.records.push(r);
    }

    persist();
    closeModal('recordModal');
    render();
};

$('deleteRecord').onclick = () => {
    if (editingId && confirm('この記録を削除しますか？')) {
        data.records = data.records.filter(
            r => String(r.id) !== String(editingId)
        );

        persist();
        closeModal('recordModal');
        render();
    }
};


/* ========================================
   設定タブ
======================================== */

function switchSettingsTab(tab) {
    const isActivity = tab === 'activity';

    $('activityPanel').style.display =
        isActivity ? 'block' : 'none';

    $('salaryPanel').style.display =
        isActivity ? 'none' : 'block';

    $('activityTab').classList.toggle('primary', isActivity);
    $('salaryTab').classList.toggle('primary', !isActivity);
}

$('activityTab').onclick = () => {
    switchSettingsTab('activity');
};

$('salaryTab').onclick = () => {
    switchSettingsTab('salary');

    for (const k of [
        'hourlyRate',
        'nightPremium',
        'nightStart',
        'nightEnd',
        'transport',
        'defaultBreakMinutes'
    ]) {
        $(k).value = data.settings[k];
    }
};


/* ========================================
   活動項目の追加・編集
======================================== */

function openActivityModal(id = null) {
    editingActivityId = id;

    const a = id
        ? data.activities.find(x => x.id === id)
        : null;

    $('activityModalTitle').textContent =
        a ? '活動項目を編集' : '設定';

    $('saveActivity').textContent =
        a ? '保存' : '追加';

    $('newActivityName').value = a?.name || '';
    $('newActivityUnit').value = a?.unit || '';
    $('newActivityColor').value = a?.color || '#5b8def';

    switchSettingsTab('activity');
    openModal('activityModal');
}

function editActivity(id) {
    openActivityModal(id);
}

$('addActivityBtn').onclick = () => {
    openActivityModal();
};

$('manageActivities').onclick = () => {
    $('activityManagement').scrollIntoView({
        behavior: 'smooth',
        block: 'center'
    });
};

$('cancelActivity').onclick = () => {
    closeModal('activityModal');
};

$('saveActivity').onclick = () => {
    const name = $('newActivityName').value.trim();
    const unit = $('newActivityUnit').value.trim();
    const color = $('newActivityColor').value;

    if (!name) {
        alert('項目名を入力してください');
        return;
    }

    if (!unit) {
        alert('集計単位を入力してください');
        return;
    }

    if (data.activities.some(
        a => a.name === name && a.id !== editingActivityId
    )) {
        alert('同じ名前の項目があります');
        return;
    }

    if (editingActivityId) {
        const a = data.activities.find(
            x => x.id === editingActivityId
        );

        if (!a) return;

        a.name = name;
        a.unit = unit;
        a.color = color;
    } else {
        data.activities.push({
            id: 'a' + Date.now(),
            name,
            unit,
            color
        });
    }

    persist();
    closeModal('activityModal');
    render();
};


/* ========================================
   給与設定
======================================== */

$('cancelSettings').onclick = () => {
    closeModal('activityModal');
};

$('saveSettings').onclick = () => {
    for (const k of [
        'hourlyRate',
        'nightPremium',
        'transport',
        'defaultBreakMinutes'
    ]) {
        data.settings[k] = Number($(k).value) || 0;
    }

    data.settings.nightStart = $('nightStart').value;
    data.settings.nightEnd = $('nightEnd').value;
    data.settings.workColor = $('workColor').value;

    persist();
    closeModal('activityModal');
    render();
    updateWorkPreview();
};

$('workColor').value = data.settings.workColor || '#29966a';


/* ========================================
   カレンダー操作
======================================== */

$('prevMonth').onclick = () => {
    viewDate.setMonth(viewDate.getMonth() - 1);
    selectedDate = null;
    render();
};

$('nextMonth').onclick = () => {
    viewDate.setMonth(viewDate.getMonth() + 1);
    selectedDate = null;
    render();
};

$('clearSelection').onclick = () => {
    selectedDate = null;
    render();
};


/* ========================================
   JSON保存・読み込み
======================================== */

$('exportBtn').onclick = () => {
    const blob = new Blob(
        [JSON.stringify(data, null, 2)],
        { type: 'application/json' }
    );

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');

    a.href = url;
    a.download = 'tsumilog-backup.json';
    a.click();

    URL.revokeObjectURL(url);
};

$('importBtn').onclick = () => {
    $('importFile').click();
};

$('importFile').onchange = async e => {
    const f = e.target.files[0];

    if (!f) return;

    try {
        const x = JSON.parse(await f.text());

        if (
            !Array.isArray(x.activities) ||
            !Array.isArray(x.records) ||
            !x.settings
        ) {
            throw Error();
        }

        data = x;

        persist();
        render();

        alert('バックアップを読み込みました');
    } catch (err) {
        alert('読み込めないJSONファイルです');
    }

    e.target.value = '';
};


/* ========================================
   モーダル操作
======================================== */

document.querySelectorAll('.modal').forEach(m => {
    let mouseDownTarget = null;

    m.addEventListener('mousedown', e => {
        mouseDownTarget = e.target;
    });

    m.addEventListener('click', e => {
        if (
            e.target === m &&
            mouseDownTarget === m
        ) {
            closeModal(m.id);
        }

        mouseDownTarget = null;
    });
});


/* ========================================
   初期表示
======================================== */

render();
