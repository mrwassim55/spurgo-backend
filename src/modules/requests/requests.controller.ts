import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RequestsService } from './requests.service';
import { CreateRequestDto } from './dto/create-request.dto';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

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

  // Store: requests sent to my store, with my answer status.
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPPLIER)
  @Get('targeted')
  findTargeted(@Request() req) {
    return this.requestsService.findTargeted(req.user.id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPPLIER)
  @Post(':id/respond')
  respond(@Param('id') id: string, @Body('action') action: string, @Request() req) {
    return this.requestsService.respond(id, req.user.id, action);
  }

  // Agent (staff) + admin
  @UseGuards(RolesGuard)
  @Roles(UserRole.STAFF, UserRole.ADMIN)
  @Get('agent')
  findForAgent(@Query('all') all?: string) {
    return this.requestsService.findForAgent(all === '1' || all === 'true');
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.STAFF, UserRole.ADMIN)
  @Post(':id/targets')
  addTarget(@Param('id') id: string, @Body('supplierId') supplierId: string, @Request() req) {
    return this.requestsService.addTarget(id, supplierId, req.user);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.STAFF, UserRole.ADMIN)
  @Post(':id/logs')
  addLog(@Param('id') id: string, @Body('type') type: string, @Body('note') note: string, @Request() req) {
    return this.requestsService.addLog(id, req.user, type, note);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.STAFF, UserRole.ADMIN)
  @Post(':id/cancel')
  cancel(@Param('id') id: string, @Request() req) {
    return this.requestsService.cancel(id, req.user);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Delete('admin/:id')
  adminRemove(@Param('id') id: string) {
    return this.requestsService.adminRemove(id);
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
