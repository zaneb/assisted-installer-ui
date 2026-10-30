import * as React from 'react';
import {
  Bullseye,
  Button,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  MenuToggle,
  MenuToggleElement,
  Select,
  SelectList,
  SelectOption,
  Spinner,
  TextInputGroup,
  TextInputGroupMain,
  TextInputGroupUtilities,
} from '@patternfly/react-core';
import TimesIcon from '@patternfly/react-icons/dist/esm/icons/times-icon';
import { OlmCatalogOperator } from '../../../../../../common/api/assisted-service/olmCatalogTypes';
import { getOperatorLabel } from './utils';

const SEARCH_DEBOUNCE_MS = 300;

type OperatorCatalogSelectProps = {
  operators: OlmCatalogOperator[];
  totalCount: number;
  isSearching: boolean;
  isDisabled?: boolean;
  selectedPackageNames: Set<string>;
  onSearchChange: (search: string) => void;
  onSelect: (operator: OlmCatalogOperator) => void;
};

/**
 * Typeahead over the operator catalog.
 *
 * Built on @patternfly/react-core primitives, following the existing `SelectFieldWithSearch`. If
 * `@patternfly/react-templates` is ever added to ui-lib, its `TypeaheadSelect` replaces the body of
 * this component wholesale; the props above are deliberately shaped to survive that swap.
 *
 * The list is select-then-list rather than render-everything: a catalog index runs to hundreds or
 * thousands of packages, so the menu only ever shows one page of search results.
 */
export const OperatorCatalogSelect = ({
  operators,
  totalCount,
  isSearching,
  isDisabled,
  selectedPackageNames,
  onSearchChange,
  onSelect,
}: OperatorCatalogSelectProps) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState('');
  const [focusedIndex, setFocusedIndex] = React.useState<number | null>(null);
  const textInputRef = React.useRef<HTMLInputElement>();

  // Debounce so that typing does not fire a request per keystroke.
  React.useEffect(() => {
    const timer = setTimeout(() => onSearchChange(inputValue), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [inputValue, onSearchChange]);

  const selectableOperators = React.useMemo(
    () => operators.filter((operator) => !selectedPackageNames.has(operator.packageName)),
    [operators, selectedPackageNames],
  );

  const handleSelect = (packageName: string) => {
    const operator = selectableOperators.find((candidate) => candidate.packageName === packageName);
    if (operator) {
      onSelect(operator);
    }
    setFocusedIndex(null);
    textInputRef.current?.focus();
  };

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!selectableOperators.length) {
      return;
    }

    switch (event.key) {
      case 'Enter':
        event.preventDefault();
        if (isOpen && focusedIndex !== null) {
          handleSelect(selectableOperators[focusedIndex].packageName);
        } else {
          setIsOpen(true);
        }
        break;
      case 'ArrowDown':
        event.preventDefault();
        setIsOpen(true);
        setFocusedIndex((previous) =>
          previous === null || previous === selectableOperators.length - 1 ? 0 : previous + 1,
        );
        break;
      case 'ArrowUp':
        event.preventDefault();
        setIsOpen(true);
        setFocusedIndex((previous) =>
          previous === null || previous === 0 ? selectableOperators.length - 1 : previous - 1,
        );
        break;
      case 'Escape':
        setIsOpen(false);
        setFocusedIndex(null);
        break;
    }
  };

  const toggle = (toggleRef: React.Ref<MenuToggleElement>) => (
    <MenuToggle
      variant="typeahead"
      innerRef={toggleRef}
      isExpanded={isOpen}
      isDisabled={isDisabled}
      isFullWidth
      onClick={() => {
        setIsOpen(!isOpen);
        textInputRef.current?.focus();
      }}
    >
      <TextInputGroup isPlain>
        <TextInputGroupMain
          value={inputValue}
          placeholder="Search the operator catalog"
          isExpanded={isOpen}
          onClick={() => setIsOpen(true)}
          onChange={(_event, value) => {
            setInputValue(value);
            setFocusedIndex(null);
            setIsOpen(true);
          }}
          onKeyDown={onInputKeyDown}
          innerRef={textInputRef}
          autoComplete="off"
          role="combobox"
          id="operator-catalog-select-input"
          aria-controls="operator-catalog-select-listbox"
          data-testid="operator-catalog-search"
        />
        <TextInputGroupUtilities {...(!inputValue ? { style: { display: 'none' } } : {})}>
          <Button
            variant="plain"
            onClick={() => {
              setInputValue('');
              setFocusedIndex(null);
              textInputRef.current?.focus();
            }}
            aria-label="Clear search"
          >
            <TimesIcon aria-hidden />
          </Button>
        </TextInputGroupUtilities>
      </TextInputGroup>
    </MenuToggle>
  );

  const hiddenCount = totalCount - operators.length;

  return (
    <FormGroup label="Add operators" fieldId="operator-catalog-select">
      <Select
        id="operator-catalog-select"
        isOpen={isOpen}
        onSelect={(_event, value) => handleSelect(value as string)}
        onOpenChange={(nextIsOpen) => {
          setIsOpen(nextIsOpen);
          if (!nextIsOpen) {
            setFocusedIndex(null);
          }
        }}
        toggle={toggle}
        isScrollable
      >
        <SelectList id="operator-catalog-select-listbox">
          {isSearching && (
            <SelectOption key="loading" isDisabled>
              <Bullseye>
                <Spinner size="lg" />
              </Bullseye>
            </SelectOption>
          )}
          {!isSearching && !selectableOperators.length && (
            <SelectOption key="no-results" isDisabled>
              {operators.length ? 'All matching operators are already added' : 'No operators found'}
            </SelectOption>
          )}
          {!isSearching &&
            selectableOperators.map((operator, index) => (
              <SelectOption
                key={operator.packageName}
                value={operator.packageName}
                description={operator.packageName}
                isFocused={focusedIndex === index}
              >
                {getOperatorLabel(operator)}
              </SelectOption>
            ))}
          {!isSearching && hiddenCount > 0 && (
            <SelectOption key="truncated" isDisabled>
              {`Showing ${operators.length} of ${totalCount} — refine your search`}
            </SelectOption>
          )}
        </SelectList>
      </Select>
      <FormHelperText>
        <HelperText>
          <HelperTextItem>
            Operators you add are mirrored into the ISO alongside the default set.
          </HelperTextItem>
        </HelperText>
      </FormHelperText>
    </FormGroup>
  );
};
