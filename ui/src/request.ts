// Bound both the request and body read; never display an HTML proxy response.
export async function requestJSON(path: string, init?: RequestInit, allowEmpty = false): Promise<any> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
        const response = await fetch(path, {...init, signal: controller.signal});
        const text = await response.text();
        let data: any;
        try { data = text ? JSON.parse(text) : undefined; }
        catch { throw new Error(`服务器返回了无法识别的响应（HTTP ${response.status}），请稍后重试。`); }
        if (!response.ok) throw new Error(typeof data?.message === 'string' ? data.message : `请求失败（HTTP ${response.status}），请重试。`);
        if (!allowEmpty && !data) throw new Error('服务器返回了空响应，请重试。');
        return data;
    } catch (error) {
        if (controller.signal.aborted) throw new Error('请求超时，请检查网络后重试。');
        if (error instanceof TypeError) throw new Error('无法连接服务器，请检查网络后重试。');
        throw error;
    } finally { clearTimeout(timeout); }
}
