import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RequestsService } from './requests.service';
import { CreateRequestDto } from './dto/create-request.dto';

@Controller('requests')
@UseGuards(AuthGuard('jwt'))
export class RequestsController {
  constructor(private readonly requestsService: RequestsService) {}

  @Post()
  create(@Body() createRequestDto: CreateRequestDto, @Request() req) {
    return this.requestsService.create(createRequestDto, req.user);
  }

  @Get('my')
  findAllMy(@Request() req) {
    return this.requestsService.findAllByUser(req.user);
  }

  @Get()
  findAll() {
    return this.requestsService.findAll();
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req) {
    return this.requestsService.remove(id, req.user.id);
  }
}
