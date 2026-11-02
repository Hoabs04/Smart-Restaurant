import { ISalesChannelProvider } from './provider.interface';
import { ChannelCode } from './types';
import { GrabFoodProvider } from './providers/grabfood.provider';
import { ShopeeFoodProvider } from './providers/shopeefood.provider';
import { MockSalesChannelProvider } from './providers/mock.provider';

class ChannelProviderFactory {
  private providers: Map<string, ISalesChannelProvider> = new Map();

  constructor() {
    this.register(new GrabFoodProvider());
    this.register(new ShopeeFoodProvider());
    this.register(new MockSalesChannelProvider());
  }

  public register(provider: ISalesChannelProvider) {
    this.providers.set(provider.channelCode.toUpperCase(), provider);
  }

  public getProvider(channelCode: string): ISalesChannelProvider {
    const code = channelCode.toUpperCase();
    const provider = this.providers.get(code);

    if (provider) {
      return provider;
    }

    // Đối với BeFood hoặc kênh chưa có provider chuyên biệt, sử dụng MockProvider với nhãn tùy biến
    if (code === 'BEFOOD') {
      return new MockSalesChannelProvider('BEFOOD', 'BeFood');
    }

    // Mặc định trả về MockProvider tương ứng với channelCode được gọi
    return new MockSalesChannelProvider(code as ChannelCode, code);
  }
}

export const channelFactory = new ChannelProviderFactory();

export function getChannelProvider(channelCode: string): ISalesChannelProvider {
  return channelFactory.getProvider(channelCode);
}

