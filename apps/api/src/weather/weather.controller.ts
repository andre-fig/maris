import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Param,
  Query,
  Res,
} from "@nestjs/common";
import type { Response } from "express";
import { gzipSync } from "node:zlib";

import { GfsService } from "./gfs.service.js";
import { GFS_FORECAST_HOURS } from "./gfs.types.js";
import { GFS_TILE_COLUMNS, GFS_TILE_ROWS, encodeGfsTile } from "./gfs-tiles.js";

const GFS_SUCCESS_CACHE_CONTROL =
  "public, s-maxage=1800, stale-while-revalidate=300";

@Controller("weather")
export class WeatherController {
  constructor(@Inject(GfsService) private readonly gfsService: GfsService) {}

  @Get("gfs")
  async getGfs(
    @Query("north") northValue?: string,
    @Query("south") southValue?: string,
    @Query("east") eastValue?: string,
    @Query("west") westValue?: string,
    @Query("forecastHours") forecastHoursValue?: string,
    @Res({ passthrough: true }) response?: Response,
  ) {
    // Errors must never be retained by a shared CDN. This is set before
    // validation and remains in place if the service throws an exception.
    response?.set("Cache-Control", "no-store");
    const north = Number(northValue);
    const south = Number(southValue);
    const east = Number(eastValue);
    const west = Number(westValue);
    if (
      northValue === undefined ||
      southValue === undefined ||
      eastValue === undefined ||
      westValue === undefined ||
      ![north, south, east, west].every(Number.isFinite)
    ) {
      throw new BadRequestException("north, south, east and west are required");
    }

    const forecastHours = forecastHoursValue
      ? forecastHoursValue.split(",").map(Number)
      : [...GFS_FORECAST_HOURS];
    const result = await this.gfsService.getPackage(
      { north, south, east, west },
      forecastHours,
    );
    response?.set("Cache-Control", GFS_SUCCESS_CACHE_CONTROL);
    return result;
  }

  @Get("gfs/tiles/:x/:y")
  async getGfsTile(
    @Param("x") xValue: string,
    @Param("y") yValue: string,
    @Query("forecastHour") forecastHourValue = "0",
    @Res() response: Response,
  ) {
    response.set("Cache-Control", "no-store");
    const x = Number(xValue);
    const y = Number(yValue);
    const forecastHour = Number(forecastHourValue);
    if (![x, y, forecastHour].every(Number.isInteger) ||
        x < 0 || x >= GFS_TILE_COLUMNS || y < 0 || y >= GFS_TILE_ROWS ||
        forecastHour < 0 || forecastHour > 384) {
      throw new BadRequestException(
        "Invalid GFS tile coordinate or forecast hour",
      );
    }
    const grid = await this.gfsService.getTile(x, y, forecastHour);
    const body = gzipSync(encodeGfsTile(grid));
    response.set("Cache-Control", GFS_SUCCESS_CACHE_CONTROL);
    response.set("Content-Type", "application/octet-stream");
    response.set("Content-Encoding", "gzip");
    return response.status(200).send(body);
  }
}
