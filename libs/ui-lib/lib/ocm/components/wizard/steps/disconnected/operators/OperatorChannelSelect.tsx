import * as React from 'react';
import {
  MenuToggle,
  MenuToggleElement,
  Select,
  SelectList,
  SelectOption,
  Tooltip,
} from '@patternfly/react-core';
import { OlmOperatorChannel } from '../../../../../../common/api/assisted-service/olmCatalogTypes';
import { sortChannels } from './utils';

type OperatorChannelSelectProps = {
  packageName: string;
  channels: OlmOperatorChannel[];
  defaultChannel: string;
  selectedChannel: string;
  onChange: (channel: string) => void;
  isDisabled?: boolean;
};

const channelLabel = (name: string, defaultChannel: string) =>
  name === defaultChannel ? `${name} (default)` : name;

export const OperatorChannelSelect = ({
  packageName,
  channels,
  defaultChannel,
  selectedChannel,
  onChange,
  isDisabled,
}: OperatorChannelSelectProps) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const sortedChannels = React.useMemo(
    () => sortChannels(channels, defaultChannel),
    [channels, defaultChannel],
  );

  const hasSingleChannel = sortedChannels.length <= 1;

  const toggle = (toggleRef: React.Ref<MenuToggleElement>) => (
    <MenuToggle
      ref={toggleRef}
      onClick={() => setIsOpen((previous) => !previous)}
      isExpanded={isOpen}
      isDisabled={isDisabled || hasSingleChannel}
      isFullWidth
      aria-label={`Channel for ${packageName}`}
      data-testid={`operator-channel-toggle-${packageName}`}
    >
      {selectedChannel ? channelLabel(selectedChannel, defaultChannel) : 'Select a channel'}
    </MenuToggle>
  );

  const select = (
    <Select
      id={`operator-channel-${packageName}`}
      isOpen={isOpen}
      selected={selectedChannel}
      onSelect={(_event, value) => {
        setIsOpen(false);
        onChange(value as string);
      }}
      onOpenChange={(nextIsOpen) => setIsOpen(nextIsOpen)}
      toggle={toggle}
      isScrollable
    >
      <SelectList>
        {sortedChannels.map((channel) => (
          <SelectOption
            key={channel.name}
            value={channel.name}
            isSelected={channel.name === selectedChannel}
            description={channel.headVersion}
            isDisabled={channel.deprecated}
          >
            {channelLabel(channel.name, defaultChannel)}
            {channel.deprecated ? ' — deprecated' : ''}
          </SelectOption>
        ))}
      </SelectList>
    </Select>
  );

  if (hasSingleChannel && !isDisabled) {
    return (
      <Tooltip content="This operator has only one channel in the catalog.">
        <div>{select}</div>
      </Tooltip>
    );
  }

  return select;
};
