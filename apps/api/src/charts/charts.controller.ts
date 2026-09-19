import { Controller, Get, Header, Inject, Query } from "@nestjs/common";
import { ChartsService } from "./charts.service.js";
import { ChartQueryDto } from "./dtos/chart-query.dto.js";
import type { ChartInformationDto } from "./dtos/chart-information.dto.js";

@Controller("charts")
export class ChartsController {
  constructor(@Inject(ChartsService) private readonly charts: ChartsService) {}

  @Get("at-point")
  @Header("Cache-Control", "no-store")
  atPoint(
    @Query() query: Record<string, unknown>,
  ): Promise<ChartInformationDto> {
    return this.charts.atPoint(ChartQueryDto.parse(query));
  }
}
