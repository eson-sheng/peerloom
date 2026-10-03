# Peerloom

Peerloom 是基于 [Screego](https://github.com/screego/server) 二次开发的自托管实时协作应用，集成屏幕共享、语音、摄像头、协作文档、白板和视频同播，适合远程讨论、结对编程和小团队协作。

后端使用 Go，前端使用 React、TypeScript 和 Vite；媒体通过 WebRTC 传输，内置 TURN 服务。生产构建将前端资源嵌入可执行文件，便于部署。

## 功能

- **屏幕与摄像头共享**：支持多成员共享内容，语音独立于视频席位。
- **实时协作**：协作文档、白板及房间聊天；文档基于 Tiptap 和 Yjs。
- **视频同播**：同一房间仅允许一位成员发起同播，结束后其他成员可以接替；暂停不会释放同播控制权。
- **房间管理**：支持成员管理、媒体权限控制和连接状态查看。
- **账号与访客**：配置用户文件后，创建房间需要登录；访客可通过链接加入已存在的房间，不存在的房间不会自动创建。
- **可配置容量**：默认每间房 12 人、6 个实时媒体席位，所有成员均可使用语音，但仍受房主媒体权限控制。
- **中文界面**：提供面向协作场景的中文操作界面。

每位成员同时只能发布屏幕、摄像头或同播中的一种内容，同播也占用媒体席位。房间聊天不保存历史；请勿将房间协作内容作为长期存储。当前媒体使用 WebRTC mesh，增加人数会增加客户端连接数和带宽负担。

## 从源码构建

准备 Go 1.26.0 或更高版本、Node.js 和 Yarn。当前仓库 CI 使用 Node.js 25；依赖以 `go.mod`、`ui/package.json` 和 `ui/yarn.lock` 为准。

在克隆自己的仓库后，进入项目根目录运行：

```bash
go mod download
(cd ui && yarn install --frozen-lockfile)
(cd ui && yarn build)
go build -ldflags "-X main.version=1.0.0 -X main.mode=prod" -o peerloom ./main.go
./peerloom --version
```

必须先构建前端，再编译 Go 程序。更新前端后也需要重新编译并替换可执行文件。

## 配置与启动

以下命令在可执行文件所在目录运行。首次部署时复制示例配置：

```bash
cp peerloom.config.example peerloom.config.local
```

编辑 `peerloom.config.local`，至少设置服务端对客户端可达的 IP 和固定的会话密钥，例如：

```dotenv
# 替换为实际公网 IP；局域网部署使用客户端可达的局域网 IP。
PEERLOOM_EXTERNAL_IP=YOUR_SERVER_IP
# 使用自行生成的随机值，例如运行 openssl rand -hex 32。
PEERLOOM_SECRET=YOUR_RANDOM_SECRET
PEERLOOM_SERVER_ADDRESS=0.0.0.0:5050
PEERLOOM_TURN_ADDRESS=0.0.0.0:3478
PEERLOOM_AUTH_MODE=turn
PEERLOOM_USERS_FILE=/absolute/path/to/users.local
PEERLOOM_MAX_ROOM_MEMBERS=12
PEERLOOM_MAX_MEDIA_SEATS=6
```

创建账号文件，命令会交互式询问密码：

```bash
./peerloom hash --name admin > users.local
```

将 `PEERLOOM_USERS_FILE` 改成该文件的实际绝对路径。新增账号时使用 `>> users.local` 追加，避免覆盖已有账号。然后启动：

```bash
./peerloom serve
```

本机可访问 `http://localhost:5050`。远程部署请配置 HTTPS，以便浏览器使用屏幕、摄像头和麦克风权限。

### 常用配置

| 配置项 | 说明 |
| --- | --- |
| `PEERLOOM_EXTERNAL_IP` | 服务端对客户端可达的 IP，启动前必须正确配置 |
| `PEERLOOM_SECRET` | 固定的会话密钥，避免重启后登录会话失效 |
| `PEERLOOM_USERS_FILE` | 账号文件路径；设置后创建房间需要登录 |
| `PEERLOOM_AUTH_MODE` | `turn`：创建 TURN 房间需认证；`all`：创建所有类型房间需认证；`none`：不增加此项认证限制。用户文件的创建房间登录要求仍独立生效 |
| `PEERLOOM_MAX_ROOM_MEMBERS` | 房间人数上限，默认 `12` |
| `PEERLOOM_MAX_MEDIA_SEATS` | 实时媒体席位上限，默认 `6`，不能超过房间人数 |
| `PEERLOOM_TURN_PORT_RANGE` | TURN 中继端口范围，例如 `50000:50100`，需同步配置防火墙 |
| `PEERLOOM_CLOSE_ROOM_WHEN_OWNER_LEAVES` | 房主离开时关闭房间的默认选项 |

完整配置项见 [peerloom.config.example](peerloom.config.example)，容量规则见 [房间与媒体容量](docs/media-capacity.md)。修改配置后需要重启服务。

生产模式按以下顺序加载配置，前面的值优先，进程环境变量优先级最高：

1. 可执行文件目录下的 `peerloom.config.local`
2. 可执行文件目录下的 `peerloom.config`
3. `~/.config/peerloom/server.config`
4. `/etc/peerloom/server.config`

开发模式在工作目录优先加载 `peerloom.config.development.local` 和 `peerloom.config.development`，再读取通用配置。生产构建需指定 `-X main.mode=prod`，以忽略开发配置。

### 网络部署

- Web 服务默认监听 TCP `5050`，可通过支持 WebSocket 的反向代理提供 HTTPS，`/stream` 需要支持 WebSocket 升级。
- 内置 TURN 默认使用 `3478`，部署时需放通对应 TCP/UDP 端口以及所配置的中继 UDP 端口范围。
- TURN 流量需要独立的网络映射，普通 HTTP 反向代理不能代替 TURN 转发。
- 公网部署需确保外部 IP、端口映射和防火墙设置一致。

## 本地开发

先完成依赖安装和一次前端构建，然后在 `peerloom.config.development.local` 中配置本地可用的 IP、账号文件等参数。

终端一启动后端：

```bash
go run . serve
```

终端二启动前端：

```bash
cd ui
yarn start
```

访问 `http://localhost:3000`。Vite 将配置、登录和 WebSocket 请求代理到 `http://localhost:5050`。

常用检查命令：

```bash
go test ./...
(cd ui && yarn build)
```

## 版本与发布

页面版本来自 `main.go` 中的 `version`，通过编译参数注入；`ui/package.json` 中的版本不控制页面显示。

```bash
go build -ldflags "-X main.version=1.0.0 -X main.mode=prod" -o peerloom ./main.go
```

建议使用 `v1.0.0` 这样的 Git 标签对应发布版本，将各平台编译产物放到自己仓库的 GitHub Releases。部署新版本时替换可执行文件并重启服务。

**当前自动发布配置尚需迁移**：`.goreleaser.yml` 仍包含 Screego 的产物及镜像名称，`.github/workflows/build.yml` 在推送 `v` 开头的标签时会触发镜像登录和 GoReleaser。首次推送版本标签前，请先改为自己的仓库与镜像地址，并配置对应凭据，或移除暂时不用的镜像发布步骤。

根目录 `Dockerfile` 只负责打包已经编译好的 `peerloom` Linux 可执行文件，不会自动构建源码。用于该 `scratch` 镜像的程序应静态编译，并匹配目标容器架构。

提交源码前检查暂存区：不要提交真实密钥、账号文件、个人部署配置或本地编译产物。仓库现有 `.gitignore` 已忽略 `*.local`，但没有忽略所有 `peerloom` 二进制文件及 `peerloom.config`。

## 致谢与许可证

Peerloom 基于 [Screego](https://github.com/screego/server) 开发，感谢原项目及相关开源依赖的贡献者。

仓库保留 GNU GPL v3 许可证，详见 [LICENSE](LICENSE)。部分 `docs/` 文档仍保留上游名称和旧配置示例，当前 Peerloom 的启动方式与配置请以本 README、示例配置和源码为准。
