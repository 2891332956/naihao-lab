# 示范素材目录

把奶蛙的官方示范视频放在这个目录里，然后在 `js/config.js` 中把 `NAIWA.demo.video` 改成对应路径即可：

```js
demo: {
  video: './assets/demo/naiwa-demo.mp4',
  poster: './assets/demo/naiwa-demo-poster.jpg',
  ...
}
```

## 素材建议

| 项目 | 建议 |
| --- | --- |
| 格式 | `.mp4`（H.264）最佳；`.webm` / `.mov` 也可 |
| 画幅 | 竖屏 9:16 或横屏 16:9 均可，画面里只有一个表演者 |
| 时长 | 5–15 秒，一镜到底，不要剪辑 |
| 机位 | 固定机位、人物全身入镜、背景干净 |
| 内容 | 示范动作清晰、幅度大、节奏明显 |
| 大小 | 建议 < 20MB（越轻加载越快） |

## 命名

- 视频：`naiwa-demo.mp4`
- 封面：`naiwa-demo-poster.jpg`
- 若之后有多个版本：`naiwa-demo-v2.mp4`

> 素材到位后只需改一行配置，页面会自动从「体验模式」切换为「官方示范」。
