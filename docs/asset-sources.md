# 素材与依赖来源

| 素材 | 来源／用途 |
| --- | --- |
| `visual-reference.png` | 内置 ImageGen 的第 1 张产品视觉稿，用户已选择；仅作设计参考，不作为页面截图背景 |
| `public/assets/starfield.png` | 内置 ImageGen 生成的独立星空背景；1586×992，CSS cover 适配视口 |
| `public/assets/earth-day.jpg` | [three-globe 官方示例](https://github.com/vasturiano/three-globe/blob/master/example/img/earth-day.jpg)，1600×800，地表漫反射纹理 |
| `public/assets/earth-lights.jpg` | [Solar System Scope Earth Night Map](https://www.solarsystemscope.com/textures/)，2048×1024；[下载来源](https://www.solarsystemscope.com/textures/download/2k_earth_nightmap.jpg)，夜间灯光自发光纹理；CC BY 4.0，归属 INOVE / Solar System Scope |
| `public/assets/earth-night.jpg` | [three-globe 官方夜间示例纹理](https://github.com/vasturiano/three-globe/blob/master/example/img/earth-night.jpg)，4096×2048，保留为开发参考，最终场景使用上方灯光纹理 |
| UI 图标 | [Phosphor Icons](https://github.com/phosphor-icons/web)，MIT；通过开源图标字体渲染 |

Solar System Scope 纹理基于 NASA 影像与地理数据进行调整，以原网站公布的 CC BY 4.0 授权为准；本项目按原图使用并在材质中调整亮度。three-globe 仓库使用 MIT 许可证，相关示例素材出处已列明。

## 星空生成记录

使用内置 ImageGen，而非 CLI。提示词核心：深蓝黑 `#030712` 的宽幅深空星空；细微白色与冷蓝星点，右下极淡银河；中央和左右区域保持深暗以便叠加 UI；无地球、行星、小行星、轨道、UI、文字、图标或水印。请求 1440×900，实际输出 1586×992，保留原图，不拉伸。

地球、轨道环和发光点由 globe.gl / Three.js 渲染，以支持真实交互，不是视觉稿中的栅格截图。

## 固定依赖

`globe.gl 2.46.2`、`three 0.180.0`、`@phosphor-icons/web 2.1.2`、`vite 6.3.5`、`tailwindcss 4.3.3`、`@tailwindcss/vite 4.3.3`；完整传递依赖版本见 `package-lock.json`。

框架文档：[globe.gl](https://github.com/vasturiano/globe.gl)、[Three.js](https://threejs.org/docs/)、[Tailwind Vite 安装](https://tailwindcss.com/docs/installation/using-vite)。
