/**
 * Peerloom 简体中文 i18n 模块
 * 所有 UI 字符串统一在此维护
 */

export const i18n: Record<string, string> = {
    // LoginForm.tsx
    'login_to_peerloom': '登录 Peerloom',
    'username': '用户名',
    'password': '密码',
    'login': '登 录',
    'go_back': '返 回',
    'logged_in_success': '登录成功！',
    'login_failed': '登录失败',
    'logged_out': '已登出',
    'logout': '退 出 登 录',
    'logout_failed': '登出失败',

    // RoomManage.tsx
    'hello': '你好',
    'login_button': '登 录',
    'id': '房间号',
    'close_room_after_you_leave': '你离开后关闭房间',
    'nat_traversal_via': 'NAT 穿透方式',
    'create_or_join_room': '创建 / 加入房间',

    // Room.tsx
    'copy_link': '复制链接',
    'link_copied': '链接已复制',
    'copy_failed': '复制失败',
    'cancel_presentation': '取消演示',
    'start_presentation': '开始演示',
    'member_list': '成员列表',
    'fullscreen': '全屏',
    'settings': '设置',
    'no_stream_available': '暂无视频流',
    'you': '我',
    'unknown': '未知',
    'owner': '房主',
    'streaming': '直播中',

    // SettingDialog.tsx
    'settings_dialog_title': '设置',
    'cancel': '取 消',
    'save': '保 存',
    'preferred_codec': '首选编码',
    'display_mode': '显示模式',
    'frame_rate': '帧率',

    // settings.ts
    'preset_best_quality': '预设：最佳质量',
    'preset_browser_default': '预设：浏览器默认',
    'fit_to_window': '适应窗口',
    'fit_width': '适应宽度',
    'fit_height': '适应高度',
    'original_size': '原始尺寸',

    // useRoom.ts
    'unknown_event': '未知事件',
    'received_unknown_event': '收到未知事件',
    'could_not_start_presentation_no_https': '无法开始演示，请确认使用的是 HTTPS 协议',
    'could_not_start_presentation_no_screen_share': '无法开始演示，你的浏览器不支持屏幕共享',
    'could_not_start_presentation': '无法开始演示',

    // NumberField.tsx
    'invalid_number': '请输入有效数字',
    'number_must_be_at_least': '数值不能小于',
};
