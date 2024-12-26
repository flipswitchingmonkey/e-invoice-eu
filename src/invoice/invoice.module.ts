/* istanbul ignore file */
import { Logger, Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';

import { InvoiceController } from './invoice.controller';
import { InvoiceService } from './invoice.service';
import { AppConfigModule } from '../app-config/app-config.module';
import { AppConfigService } from '../app-config/app-config.service';
import { FormatFactoryService } from '../format/format.factory.service';
import { FormatModule } from '../format/format.module';
import { MappingModule } from '../mapping/mapping.module';
import { MappingService } from '../mapping/mapping.service';
import { ValidationModule } from '../validation/validation.module';
import { ValidationService } from '../validation/validation.service';

@Module({
	imports: [
		AppConfigModule,
		FormatModule,
		MappingModule,
		ValidationModule,
		MulterModule.registerAsync({
			imports: [AppConfigModule],
			useFactory: async (configService: AppConfigService) => ({
				limits: {
					fileSize: configService.get('uploads').maxSizeMb,
				},
			}),
			inject: [AppConfigService],
		}),
	],
	controllers: [InvoiceController],
	providers: [
		Logger,
		FormatFactoryService,
		InvoiceService,
		MappingService,
		ValidationService,
	],
	exports: [InvoiceService],
})
export class InvoiceModule {}
