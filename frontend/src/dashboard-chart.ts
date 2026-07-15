import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";

echarts.use([LineChart, GridComponent, TooltipComponent, SVGRenderer]);

export interface DashboardChartStage {
  key: string;
  label: string;
  count: number;
  conversionRate: number;
}

export interface DashboardChartController {
  dispose(): void;
}

export interface DashboardChartOptions {
  host: HTMLElement;
  travelLight: HTMLElement | null;
  stages: DashboardChartStage[];
  colors: Record<string, string>;
  onStageClick: (key: string) => void;
}

function escapeTooltipHtml(value: string) {
  return value.replace(/[&<>"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;"
  })[character] || character);
}

function buildLeadFlowMotionPath(width: number, height: number, values: number[], maxValue: number) {
  const left = 22;
  const right = 22;
  const top = 28;
  const bottom = 8;
  const plotWidth = Math.max(1, width - left - right);
  const plotHeight = Math.max(1, height - top - bottom);
  const points = values.map((value, index) => ({
    x: left + (values.length === 1 ? plotWidth / 2 : (index * plotWidth) / (values.length - 1)),
    y: top + (1 - value / maxValue) * plotHeight
  }));
  if (!points.length) return "none";
  let path = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[index - 1] || points[index];
    const current = points[index];
    const next = points[index + 1];
    const after = points[index + 2] || next;
    const control1X = current.x + (next.x - previous.x) / 10;
    const control1Y = current.y + (next.y - previous.y) / 10;
    const control2X = next.x - (after.x - current.x) / 10;
    const control2Y = next.y - (after.y - current.y) / 10;
    path += ` C ${control1X.toFixed(2)} ${control1Y.toFixed(2)}, ${control2X.toFixed(2)} ${control2Y.toFixed(2)}, ${next.x.toFixed(2)} ${next.y.toFixed(2)}`;
  }
  return `path("${path}")`;
}

export function createDashboardLeadFunnelChart(options: DashboardChartOptions): DashboardChartController {
  const { host, travelLight, stages, colors, onStageClick } = options;
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const maxCount = Math.max(1, ...stages.map((stage) => stage.count));
  const chart = echarts.init(host, undefined, { renderer: "svg" });
  chart.setOption({
    animation: !prefersReducedMotion,
    animationDuration: 720,
    animationDurationUpdate: 350,
    animationEasing: "cubicOut",
    grid: {
      left: 22,
      right: 22,
      top: 28,
      bottom: 8,
      containLabel: false
    },
    tooltip: {
      trigger: "item",
      confine: true,
      backgroundColor: "#172033",
      borderWidth: 0,
      padding: [8, 10],
      textStyle: { color: "#ffffff", fontSize: 12 },
      formatter: (params: { data: { label: string; value: number; conversionRate: number } }) =>
        `${escapeTooltipHtml(params.data.label)}<br/><b>${params.data.value}</b> · ${params.data.conversionRate}%`
    },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: stages.map((stage) => stage.label),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { show: false },
      splitLine: { show: false }
    },
    yAxis: {
      type: "value",
      min: 0,
      max: Math.max(2, Math.ceil(maxCount * 1.28)),
      show: false
    },
    series: [{
      type: "line",
      smooth: 0.34,
      smoothMonotone: "x",
      symbol: "circle",
      symbolSize: 8,
      showSymbol: true,
      connectNulls: true,
      lineStyle: {
        width: 2,
        color: "#8197c8",
        cap: "round",
        shadowBlur: 3,
        shadowColor: "rgba(64, 88, 145, .11)"
      },
      areaStyle: {
        opacity: 1,
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: "rgba(81, 106, 170, .075)" },
          { offset: 0.72, color: "rgba(81, 106, 170, .018)" },
          { offset: 1, color: "rgba(49, 87, 213, 0)" }
        ])
      },
      label: {
        show: true,
        position: "top",
        distance: 7,
        color: "#172033",
        fontSize: 13,
        fontWeight: 700,
        formatter: (params: { value: number }) => String(params.value)
      },
      emphasis: {
        scale: 1.45,
        focus: "self",
        itemStyle: {
          borderWidth: 3,
          borderColor: "#ffffff",
          shadowBlur: 12,
          shadowColor: "rgba(23, 32, 51, .22)"
        }
      },
      data: stages.map((stage) => ({
        value: stage.count,
        name: stage.label,
        key: stage.key,
        label: stage.label,
        conversionRate: stage.conversionRate,
        itemStyle: {
          color: colors[stage.key] || "#3157d5",
          borderWidth: 2,
          borderColor: "#ffffff",
          shadowBlur: stage.key === "pending" ? 8 : 4,
          shadowColor: `${colors[stage.key] || "#3157d5"}55`
        }
      }))
    }]
  });
  chart.on("click", (params) => {
    const stage = params.data as { key?: string } | undefined;
    onStageClick(stage?.key || "entered");
  });

  const positionTravelLight = () => {
    chart.resize();
    if (!travelLight || prefersReducedMotion) return;
    travelLight.style.offsetPath = buildLeadFlowMotionPath(
      host.clientWidth,
      host.clientHeight,
      stages.map((stage) => stage.count),
      Math.max(2, Math.ceil(maxCount * 1.28))
    );
  };
  positionTravelLight();
  const resizeObserver = new ResizeObserver(positionTravelLight);
  resizeObserver.observe(host);

  return {
    dispose() {
      resizeObserver.disconnect();
      chart.dispose();
    }
  };
}
