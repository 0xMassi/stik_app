/// Simplified Chinese (zh-CN).
///
/// Typed as `Translations`, so this file fails to compile if it drifts from
/// the English catalogue — a missing key is a build error, not a runtime
/// fallback. Terminology follows macOS zh-CN conventions (程序坞 for Dock,
/// 菜单栏 for menu bar, 快捷键 for shortcuts).
///
/// Key cap labels (esc / enter / tab / opt) stay in English: they're printed
/// that way on the physical keyboard. Brand and proper nouns (Whisper, Git,
/// iCloud Drive, Vim, AI) are likewise left untranslated.
import type { Translations } from "..";

export const zhCN: Translations = {
  // ── Common ────────────────────────────────────────────────────────
  "common.cancel": "取消",
  "common.confirm": "确认",
  "common.esc": "esc",
  "common.enter": "enter",
  "common.tab": "tab",
  "common.opt": "opt",
  "common.loading": "加载中…",
  "common.import": "导入",
  "common.saved": "已保存",
  "common.syncing": "同步中…",
  "common.linking": "连接中…",
  "common.somethingWentWrong": "出错了",
  "common.justNow": "刚刚",
  "common.delete": "删除",
  "common.close": "关闭",
  "note.failedToLoad": "无法加载笔记",
  "sync.syncingWithICloud": "正在与 iCloud 同步…",
  "sync.syncedWithICloud": "已与 iCloud 同步",

  // ── Settings — navigation ─────────────────────────────────────────
  "settings.title": "设置",
  "settings.tab.appearance": "外观",
  "settings.tab.shortcuts": "快捷键",
  "settings.tab.folders": "文件夹",
  "settings.tab.editor": "编辑器",
  "settings.tab.templates": "模板",
  "settings.tab.gitSharing": "Git 共享",
  "settings.tab.ai": "AI",
  "settings.tab.dictation": "听写",
  "settings.tab.insights": "统计",
  "settings.tab.privacy": "隐私",
  "settings.onThisDayUnavailable": "无法获取“历年今日”",
  "settings.onThisDayNoCheck": "尚未检查“历年今日”",
  "settings.streakUnavailable": "无法获取连续记录",

  // ── Settings — language ───────────────────────────────────────────
  "settings.language.title": "语言",
  "settings.language.description":
    "Stik 界面所使用的语言。你的笔记内容不会被翻译。",
  "settings.language.system": "跟随系统语言",

  // ── Settings — appearance ─────────────────────────────────────────
  "settings.theme.name": "主题名称",
  "settings.theme.namePlaceholder": "我的主题",
  "settings.theme.dark": "深色主题",
  "settings.theme.colors": "颜色",
  "settings.theme.create": "创建自定主题",
  "settings.theme.edit": "编辑主题",
  "settings.theme.export": "导出主题",
  "settings.theme.delete": "删除主题",
  "settings.theme.deleteConfirm": "要删除该主题吗？",
  "settings.theme.importFile": "导入主题文件",
  "settings.theme.files": "主题文件",
  "settings.color.background": "背景",
  "settings.color.surface": "面板",
  "settings.color.text": "文字",
  "settings.color.mutedText": "次要文字",
  "settings.color.borders": "边框",
  "settings.color.accent": "强调色",
  "settings.color.accentLight": "浅强调色",
  "settings.color.accentDark": "深强调色",
  "settings.color.highlight": "高亮",
  "settings.font.editorFont": "编辑器字体",
  "settings.font.importFile": "导入字体文件",
  "settings.font.files": "字体文件",
  "settings.font.remove": "移除字体",
  "settings.fontSize": "字体大小",

  // ── Settings — editor ─────────────────────────────────────────────
  "settings.vimMode": "Vim 模式",
  "settings.vimMode.toggle": "切换 Vim 模式",
  "settings.vim.quickReference": "快速参考",
  "settings.vim.movement": "移动",
  "settings.vim.insert": "插入",
  "settings.vim.edit": "编辑",
  "settings.vim.visual": "可视",
  "settings.vim.undo": "撤销",
  "settings.vim.commands": "命令",
  "settings.vim.howToClose": "如何退出",
  "settings.textDirection.auto": "自动（推荐）",
  "settings.textDirection.ltr": "从左到右",
  "settings.textDirection.rtl": "从右到左",

  // ── Settings — folders / storage ──────────────────────────────────
  "settings.notesDirectory": "笔记目录",
  "settings.notesDirectory.choose": "选择 Stik 笔记的存储位置",
  "settings.defaultFolder": "默认文件夹",
  "settings.icloud.title": "iCloud 云盘",
  "settings.icloud.toggle": "切换 iCloud 云盘同步",

  // ── Settings — templates ──────────────────────────────────────────
  "settings.template.commandName": "命令名称",
  "settings.template.namePlaceholder": "我的模板",
  "settings.template.body": "模板内容",
  "settings.template.add": "添加模板",
  "settings.template.edit": "编辑模板",
  "settings.template.delete": "删除模板",
  "settings.template.deleteConfirm": "要删除该模板吗？",

  // ── Settings — shortcuts ──────────────────────────────────────────
  "settings.shortcut.add": "添加快捷键",
  "settings.shortcut.remove": "移除快捷键",
  "settings.shortcut.system": "系统快捷键",
  "settings.shortcut.resetDefault": "恢复默认",
  "settings.shortcut.clickToRecord": "点按以录制",

  // ── Settings — window / system ────────────────────────────────────
  "settings.hideDockIcon": "隐藏程序坞图标",
  "settings.hideDockIcon.toggle": "切换程序坞图标显示",
  "settings.hideTrayIcon.toggle": "切换菜单栏图标显示",
  "settings.autoUpdate.toggle": "切换自动更新",

  // ── Settings — git sharing ────────────────────────────────────────
  "settings.git.toggle": "切换 Git 共享",
  "settings.git.remoteUrl": "远程地址",
  "settings.git.sharedFolder": "共享文件夹",
  "settings.git.advanced": "高级",
  "settings.git.branch": "分支",
  "settings.git.pullInterval": "拉取间隔",
  "settings.git.layoutSelected": "所选文件夹为仓库根目录",
  "settings.git.layoutWhole": "整个 Stik 文件夹为仓库根目录",

  // ── Settings — AI ─────────────────────────────────────────────────
  "settings.ai.toggle": "切换 AI 功能",
  "settings.ai.howItWorks": "工作原理",
  "settings.ai.semanticSearch": "语义搜索",
  "settings.ai.folderSuggestions": "文件夹建议",
  "settings.ai.noteEmbeddings": "笔记向量",
  "settings.ai.privacy": "隐私",

  // ── Settings — privacy / analytics ────────────────────────────────
  "settings.analytics.toggle": "切换匿名统计",
  "settings.analytics.collectAppOpens": "应用启动次数（每日活跃使用）",
  "settings.analytics.collectDevice": "设备类型（macOS 版本、CPU 架构）",
  "settings.analytics.collectScreen": "屏幕分辨率与应用版本",
  "settings.analytics.collectId": "匿名设备标识符",
  "settings.analytics.neverNotes": "你的笔记、标题或文件夹名称",
  "settings.analytics.neverPaths": "文件路径或个人信息",
  "settings.analytics.neverIdentify": "任何可以识别你身份的信息",
  "settings.analytics.yourDeviceId": "你的设备 ID",

  // ── Settings — durations ──────────────────────────────────────────
  "duration.1minute": "1 分钟",
  "duration.5minutes": "5 分钟",
  "duration.15minutes": "15 分钟",
  "duration.30minutes": "30 分钟",
  "duration.1hour": "1 小时",

  // ── Dictation ─────────────────────────────────────────────────────
  "dictation.onDevice": "设备端听写",
  "dictation.model": "模型",
  "dictation.models": "模型",
  "dictation.selectLanguage": "选择语言",

  // ── Spoken languages (dictation targets) ──────────────────────────
  "language.autoDetect": "自动检测",
  "language.english": "英语",
  "language.italian": "意大利语",
  "language.spanish": "西班牙语",
  "language.french": "法语",
  "language.german": "德语",
  "language.portuguese": "葡萄牙语",
  "language.dutch": "荷兰语",
  "language.japanese": "日语",
  "language.chinese": "中文",
  "language.korean": "韩语",
  "language.russian": "俄语",
  "language.arabic": "阿拉伯语",
  "language.hindi": "印地语",
  "language.turkish": "土耳其语",
  "language.polish": "波兰语",
  "language.greek": "希腊语",
  "language.czech": "捷克语",
  "language.swedish": "瑞典语",
  "language.romanian": "罗马尼亚语",
  "language.ukrainian": "乌克兰语",

  // ── Post-it ───────────────────────────────────────────────────────
  "postit.pinToScreen": "固定到屏幕",
  "postit.actions": "操作",
  "postit.closeWithoutSaving": "不保存并关闭",
  "postit.saveAndClose": "保存并关闭（Esc）",

  // ── Formatting toolbar ────────────────────────────────────────────
  "format.heading": "标题",
  "format.bold": "粗体",
  "format.italic": "斜体",
  "format.strikethrough": "删除线",
  "format.inlineCode": "行内代码",
  "format.blockquote": "引用",
  "format.bulletList": "无序列表",
  "format.orderedList": "有序列表",
  "format.taskList": "任务列表",

  // ── Link popover ──────────────────────────────────────────────────
  "link.text": "文字",
  "link.textPlaceholder": "链接文字",
  "link.url": "网址",
  "link.openInBrowser": "在浏览器中打开",
  "link.edit": "编辑链接",
  "link.remove": "移除链接",

  // ── Tables (editor block widgets) ─────────────────────────────────
  "table.insertRowAbove": "在上方插入行",
  "table.insertRowBelow": "在下方插入行",
  "table.insertColumnLeft": "在左侧插入列",
  "table.insertColumnRight": "在右侧插入列",
  "table.deleteRow": "删除行",
  "table.deleteColumn": "删除列",
  "table.addRowBelow": "在下方添加行",
  "table.addColumnRight": "在右侧添加列",
  "heading.unfold": "展开",

  // ── AI menu ───────────────────────────────────────────────────────
  "ai.assistant": "AI 助手",
  "ai.folder": "文件夹：",
  "ai.tags": "标签：",
  "ai.chooseStyle": "选择风格",

  // ── Command palette / folders ─────────────────────────────────────
  "palette.allFolders": "所有文件夹",
  "palette.folderNamePlaceholder": "文件夹名称…",
  "palette.noteTitlePlaceholder": "笔记标题…",
  "appleNotes.searchPlaceholder": "搜索“备忘录”…",

  // ── Misc ──────────────────────────────────────────────────────────
  "lock.lockedNote": "已锁定的笔记",
  "analytics.whatsNew": "更新内容",
  "analytics.ifEnjoying": "如果你喜欢 Stik，欢迎：",
};
